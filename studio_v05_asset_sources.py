"""v0.5 server-side asset referencing, managed copying, SHA-256 deduplication and relinking.

Only paths inside the operator-controlled data/asset_inbox directory can be
referenced. No caller-supplied absolute filesystem paths are accepted.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import threading
from pathlib import Path

import library_assets

LOCK = threading.RLock()
ID_RE = re.compile(r"v05source:[0-9a-f]{24}\Z")
SHA_RE = re.compile(r"[0-9a-f]{64}\Z")
MODES = {"reference", "copy"}


class AssetSourceError(ValueError):
    pass


def _safe_input(inbox: Path, relative_path: str) -> Path:
    if not isinstance(relative_path, str) or not 1 <= len(relative_path) <= 512:
        raise AssetSourceError("A relative path in the import inbox is required")
    if "\\" in relative_path or "\x00" in relative_path or ":" in relative_path:
        raise AssetSourceError("Invalid import path")
    relative = Path(relative_path)
    if relative.is_absolute() or any(part in ("", ".", "..") for part in relative.parts):
        raise AssetSourceError("Path traversal is not allowed")
    base = inbox.resolve()
    candidate = base / relative
    # Reject symlinks even if the destination is within the permitted tree.
    current = base
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            raise AssetSourceError("Symbolic links are not accepted")
    resolved = candidate.resolve()
    if not resolved.is_relative_to(base) or not resolved.is_file():
        raise AssetSourceError("Import file is unavailable or outside the inbox")
    return resolved


def _fingerprint(path: Path, kind: str) -> tuple[str, int, str]:
    size = path.stat().st_size
    try:
        ext = library_assets.validate(kind, path.name, size)
    except ValueError as exc:
        raise AssetSourceError(str(exc)) from exc
    with path.open("rb") as stream:
        head = stream.read(64)
        if not library_assets.valid_signature(ext, head):
            raise AssetSourceError("File signature does not match the extension")
        if ext == "glb" and int.from_bytes(head[8:12], "little") != size:
            raise AssetSourceError("GLB header size mismatch")
        stream.seek(0)
        digest = hashlib.sha256()
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest(), size, ext


def _load(store: Path) -> dict:
    file = store / "index.json"
    if not file.exists():
        return {"schema": 1, "revision": 0, "items": []}
    data = json.loads(file.read_text(encoding="utf-8"))
    if (not isinstance(data, dict) or data.get("schema") != 1
        or type(data.get("revision")) is not int or data["revision"] < 0
        or not isinstance(data.get("items"), list)):
        raise AssetSourceError("Source catalog is invalid; it has not been overwritten")
    return data


def _save(store: Path, data: dict):
    # Reuse the existing atomic JSON helper (temp file + fsync + os.replace).
    from studio_project_catalog import _atomic
    store.mkdir(parents=True, exist_ok=True)
    _atomic(store / "index.json", data)


def listing(store: Path, inbox: Path) -> dict:
    with LOCK:
        data = _load(store)
        out = []
        for record in data["items"]:
            if not isinstance(record, dict): continue
            try:
                actual = _safe_input(inbox, record["relative_path"])
                available = actual.stat().st_size == record["bytes"]
            except (AssetSourceError, OSError, KeyError, TypeError):
                available = False
            out.append({
                "id": record.get("id"), "name": record.get("name"),
                "filename": record.get("name"), "kind": record.get("kind"),
                "format": record.get("format"), "source": "v05source",
                "mode": "reference", "sha256": record.get("sha256"),
                "available": available, "previewable": False,
                "relative_path": record.get("relative_path")
            })
        return {"schema": 1, "revision": data["revision"], "items": out}


def register(store: Path, inbox: Path, library_root: Path,
             relative_path: str, kind: str, mode: str, revision: int) -> dict:
    if mode not in MODES:
        raise AssetSourceError("Unsupported source mode")
    if type(revision) is not int:
        raise AssetSourceError("Revision required")
    path = _safe_input(inbox, relative_path)
    digest, size, ext = _fingerprint(path, kind)
    with LOCK:
        data = _load(store)
        if revision != data["revision"]:
            raise AssetSourceError("Revision conflict")
        # Detect same bytes in both storage backends, without creating a duplicate.
        for row in library_assets.read_index(library_root):
            if row.get("sha256") == digest and row.get("kind") == kind:
                return {"duplicate": True, "item": row, "revision": data["revision"]}
        for row in data["items"]:
            if row.get("sha256") == digest and row.get("kind") == kind:
                return {"duplicate": True, "item": row, "revision": data["revision"]}
        if mode == "copy":
            with path.open("rb") as file:
                item = library_assets.register_stream(library_root, file, size, kind, path.name)
            return {"duplicate": False, "item": item, "revision": data["revision"]}
        ident = hashlib.sha256((digest + "\x00" + kind + "\x00" + path.name).encode("utf-8")).hexdigest()[:24]
        item = {"id": "v05source:" + ident, "kind": kind, "name": path.name,
                "format": ext.upper(), "bytes": size, "sha256": digest,
                "relative_path": relative_path, "source": "v05source"}
        data["items"].append(item)
        data["revision"] += 1
        _save(store, data)
        return {"duplicate": False, "item": item, "revision": data["revision"]}


def relink(store: Path, inbox: Path, asset_id: str,
           relative_path: str, revision: int) -> dict:
    if not isinstance(asset_id, str) or not ID_RE.fullmatch(asset_id):
        raise AssetSourceError("Invalid reference asset ID")
    if type(revision) is not int:
        raise AssetSourceError("Revision required")
    path = _safe_input(inbox, relative_path)
    with LOCK:
        data = _load(store)
        if revision != data["revision"]:
            raise AssetSourceError("Revision conflict")
        item = next((r for r in data["items"] if r.get("id") == asset_id), None)
        if item is None:
            raise AssetSourceError("Reference asset not found")
        sha, size, ext = _fingerprint(path, item["kind"])
        if sha != item["sha256"] or size != item["bytes"]:
            raise AssetSourceError("Relink rejected: file contents have changed")
        if item["relative_path"] == relative_path:
            return {"item": item, "revision": data["revision"]}
        item["relative_path"] = relative_path
        data["revision"] += 1
        _save(store, data)
        return {"item": item, "revision": data["revision"]}


def file_for(store: Path, inbox: Path, asset_id: str):
    if not isinstance(asset_id, str) or not ID_RE.fullmatch(asset_id):
        return None
    with LOCK:
        item = next((r for r in _load(store)["items"] if r.get("id") == asset_id), None)
        if not item: return None
        try:
            path = _safe_input(inbox, item["relative_path"])
            if path.stat().st_size != item["bytes"]: return None
            # Verify bytes at read time to avoid serving silently replaced sources.
            digest, _, ext = _fingerprint(path, item["kind"])
            if digest != item["sha256"]: return None
            return path, library_assets.MIME[ext]
        except (OSError, AssetSourceError, KeyError, ValueError):
            return None
