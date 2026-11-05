"""Logical names for immutable v0.5 MP4 jobs.

The UUID output files are never overwritten. A small atomic index points a
download name to its current job and retains replaced jobs for restoration.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import unicodedata
from pathlib import Path

from bai_studio.projects.catalog import _atomic

LOCK = threading.RLock()
JOB_ID = re.compile(r"[0-9a-f]{32}\Z")
BAD_NAME = re.compile(r'[\\/<>:"|?*\x00-\x1f]')
RESERVED = re.compile(r"(?i)(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])\Z")


class NameError(ValueError):
    def __init__(self, message: str, status: int = 422):
        super().__init__(message)
        self.status = status


def normalize(name: str) -> str:
    if not isinstance(name, str):
        raise NameError("完成物の名前を入力してください", 400)
    name = unicodedata.normalize("NFC", name.strip())
    if not name or len(name) > 84 or BAD_NAME.search(name) or name.endswith((" ", ".")):
        raise NameError("完成物の名前は80文字以内で、パス記号や末尾の点を含めないでください", 400)
    if name.lower().endswith(".mp4"):
        stem = name[:-4]
    elif "." in name:
        raise NameError("完成物の形式はMP4のみです", 400)
    else:
        stem = name
    if not stem or len(stem) > 80 or RESERVED.fullmatch(stem):
        raise NameError("完成物の名前を変更してください", 400)
    return stem + ".mp4"


def _path(root: Path, project_id: str) -> Path:
    digest = hashlib.sha256(project_id.encode("utf-8")).hexdigest()
    return root / "names" / f"{digest}.json"


def _read(root: Path, project_id: str) -> dict:
    path = _path(root, project_id)
    if not path.is_file():
        return {"schema": 1, "project_id": project_id, "revision": 0, "names": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        if (data.get("schema") != 1 or data.get("project_id") != project_id or
                type(data.get("revision")) is not int or data["revision"] < 0 or
                not isinstance(data.get("names"), dict)):
            raise ValueError("invalid name index")
        for key, entry in data["names"].items():
            if (not isinstance(key, str) or not isinstance(entry, dict) or
                    normalize(entry.get("name")).casefold() != key or
                    not isinstance(entry.get("current"), str) or not JOB_ID.fullmatch(entry["current"]) or
                    not isinstance(entry.get("history"), list) or
                    any(not isinstance(job_id, str) or not JOB_ID.fullmatch(job_id)
                        for job_id in entry["history"])):
                raise ValueError("invalid name entry")
        return data
    except (OSError, ValueError, TypeError, KeyError) as exc:
        raise NameError("完成物の名前台帳を読めません。既存完成物を保持します") from exc


def _suggest(names: dict, requested: str) -> str:
    if requested.casefold() not in names:
        return requested
    stem = requested[:-4]
    for version in range(2, 10000):
        suffix = f"-v{version:02d}"
        candidate = stem[:80 - len(suffix)] + suffix + ".mp4"
        if candidate.casefold() not in names:
            return candidate
    raise NameError("新しい版名を提案できません")


def preview(root: Path, project_id: str, name: str) -> dict:
    requested = normalize(name)
    with LOCK:
        data = _read(root, project_id)
        current = data["names"].get(requested.casefold())
        return {"project_id": project_id, "requested_name": requested,
                "exists": current is not None, "current_job_id": current["current"] if current else None,
                "suggested_name": _suggest(data["names"], requested),
                "revision": data["revision"]}


def plan(root: Path, project_id: str, name: str, mode: str,
         replace_job_id: str | None) -> dict:
    if mode not in {"version", "replace"}:
        raise NameError("同名時の操作を選んでください", 400)
    with LOCK:
        info = preview(root, project_id, name)
        if mode == "replace":
            if not info["exists"] or replace_job_id != info["current_job_id"]:
                raise NameError("置換する完成物が変わりました。名前を確認し直してください", 409)
            target = info["requested_name"]
        else:
            if replace_job_id is not None:
                raise NameError("新版名では置換対象を指定しません", 400)
            target = info["suggested_name"]
        return {"requested_name": info["requested_name"], "download_name": target,
                "mode": mode, "replace_job_id": replace_job_id,
                "revision": info["revision"]}


def _check_output(root: Path, job_id: str) -> None:
    from bai_studio.v05.render.media_render import output_file, status, _sha
    try:
        path = output_file(root, job_id)
        if _sha(path) != status(root, job_id).get("sha256"):
            raise ValueError("completed MP4 hash changed")
    except Exception as exc:
        raise NameError("置換前の完成物を読めません。旧版を保持します") from exc


def finalize(root: Path, project_id: str, plan_data: dict, job_id: str,
             temp: Path, final: Path) -> None:
    """Only a new UUID file is moved. Existing output bytes are never touched."""
    with LOCK:
        data = _read(root, project_id)
        if data["revision"] != plan_data["revision"]:
            raise NameError("完成物の名前台帳が変わりました。旧版を保持します", 409)
        key = plan_data["download_name"].casefold()
        current = data["names"].get(key)
        if plan_data["mode"] == "replace":
            if not current or current["current"] != plan_data["replace_job_id"]:
                raise NameError("置換対象が変わりました。旧版を保持します", 409)
            _check_output(root, current["current"])
            current["history"].append(current["current"])
            current["current"] = job_id
        else:
            if current:
                raise NameError("提案した版名が使われました。名前を確認し直してください", 409)
            data["names"][key] = {"name": plan_data["download_name"],
                                  "current": job_id, "history": []}
        data["revision"] += 1
        if final.exists():
            raise NameError("同じジョブIDの完成物があります。旧版を保持します")
        os.replace(temp, final)
        try:
            _atomic(_path(root, project_id), data)
        except OSError:
            final.unlink(missing_ok=True)
            raise


def restore(root: Path, project_id: str, name: str, job_id: str,
            revision: int, current_job_id: str) -> dict:
    requested = normalize(name)
    if type(revision) is not int or not isinstance(job_id, str) or not JOB_ID.fullmatch(job_id):
        raise NameError("復元する版を選び直してください", 400)
    with LOCK:
        data = _read(root, project_id)
        entry = data["names"].get(requested.casefold())
        if (data["revision"] != revision or not entry or
                entry["current"] != current_job_id or job_id not in entry["history"]):
            raise NameError("復元する版または現行版が変わりました。読み直してください", 409)
        _check_output(root, job_id)
        _check_output(root, current_job_id)
        entry["history"].remove(job_id)
        entry["history"].append(current_job_id)
        entry["current"] = job_id
        data["revision"] += 1
        _atomic(_path(root, project_id), data)
        return {"project_id": project_id, "name": entry["name"],
                "current_job_id": job_id, "revision": data["revision"]}


def state(root: Path, project_id: str, name: str | None, job_id: str) -> str | None:
    if not name:
        return None
    with LOCK:
        entry = _read(root, project_id)["names"].get(name.casefold())
        if not entry:
            return None
        return "current" if entry["current"] == job_id else "archived" if job_id in entry["history"] else None
