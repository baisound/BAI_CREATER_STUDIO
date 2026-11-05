"""旧保存→v0.5取込の「取込記録」のストア（設計 §4、WP-L2）。

保存先: <root>/studio_v05_legacy_imports/<作品ID>.json、退避先: .../history/<作品ID>-<UTC時刻>.json。
書き込みは studio_project_catalog._atomic（一時ファイル→置換）。壊れたファイルは上書きしない。
v0.5の保存ファイルは一切触らない。
"""
from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from bai_studio.projects.catalog import _atomic
from bai_studio.v05.imports.legacy_import import LegacyImportError

DIR_NAME = "studio_v05_legacy_imports"
HISTORY_NAME = "history"
MAX_BYTES = 6 * 1024 * 1024
STATES = ("applying", "applied", "reverting", "reverted", "rolled_back", "undo_failed")
STEP_KINDS = ("fps", "scene_add", "clip_place", "clip_source", "clip_assign", "playhead")
STEP_STATUSES = ("pending", "done", "undone", "undo_failed")
ITEM_STATUSES = ("mapped", "kept")
_TOP = {"schema", "project_id", "state", "created_at", "updated_at", "source", "target_before",
        "assets", "items", "steps", "undo", "error"}
_SOURCE = {"snapshot", "bundle", "presence", "live", "include", "fps_policy"}
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
_PRESENCE = ("absent", "null", "value")


class RecordInvalid(ValueError):
    """記録の形が §4 に合わない（書き込み前の検査で見つかる。プログラムの誤り）。"""


def _bad(msg):
    raise RecordInvalid(msg)


def _is_int(v):
    return type(v) is int


def _check_id(project_id):
    if not isinstance(project_id, str) or not _UUID.match(project_id):
        _bad("project_id must be a lowercase UUID")


def validate_record(record, project_id):
    """§4 の形を検査する。合わなければ RecordInvalid。"""
    _check_id(project_id)
    if not isinstance(record, dict):
        _bad("record must be an object")
    if set(record) != _TOP:
        _bad("record fields mismatch: missing=%s extra=%s" % (sorted(_TOP - set(record)), sorted(set(record) - _TOP)))
    if not _is_int(record["schema"]) or record["schema"] != 1:
        _bad("schema must be 1")
    if record["project_id"] != project_id:
        _bad("project_id mismatch")
    if record["state"] not in STATES:
        _bad("invalid state")
    for k in ("created_at", "updated_at"):
        if not isinstance(record[k], str) or not record[k]:
            _bad(k + " must be a non-empty string")
    src = record["source"]
    if not isinstance(src, dict) or set(src) != _SOURCE:
        _bad("source fields mismatch")
    snap = src["snapshot"]
    if not isinstance(snap, dict) or set(snap) != {"saved_at", "sha256"}:
        _bad("source.snapshot fields mismatch")
    if not isinstance(src["bundle"], dict):
        _bad("source.bundle must be an object")
    pres = src["presence"]
    if not isinstance(pres, dict) or any(not isinstance(k, str) or v not in _PRESENCE for k, v in pres.items()):
        _bad("source.presence invalid")
    live = src["live"]
    if not isinstance(live, dict) or set(live) != {"music_dance", "timeline_editor"}:
        _bad("source.live fields mismatch")
    for v in live.values():
        if v is not None and (not isinstance(v, dict) or set(v) != {"sha256", "value"}):
            _bad("source.live entry invalid")
    if not isinstance(src["include"], list) or any(not isinstance(x, str) for x in src["include"]):
        _bad("source.include must be a list of strings")
    if not isinstance(src["fps_policy"], str):
        _bad("source.fps_policy must be a string")
    if not isinstance(record["target_before"], dict):
        _bad("target_before must be an object")
    if not isinstance(record["assets"], list) or any(not isinstance(a, dict) for a in record["assets"]):
        _bad("assets must be a list of objects")
    items = record["items"]
    if not isinstance(items, list):
        _bad("items must be a list")
    for it in items:
        if not isinstance(it, dict) or not {"id", "pointer", "label", "status", "codes"} <= set(it):
            _bad("item fields missing")
        if it["status"] not in ITEM_STATUSES:
            _bad("invalid item status")
        if not isinstance(it["codes"], list):
            _bad("item codes must be a list")
    steps = record["steps"]
    if not isinstance(steps, list):
        _bad("steps must be a list")
    for st in steps:
        if not isinstance(st, dict) or not {"n", "kind", "status"} <= set(st):
            _bad("step fields missing")
        if not _is_int(st["n"]) or st["n"] < 1:
            _bad("step n must be a positive integer")
        if st["kind"] not in STEP_KINDS:
            _bad("invalid step kind")
        if st["status"] not in STEP_STATUSES:
            _bad("invalid step status")
    undo = record["undo"]
    if not isinstance(undo, dict) or set(undo) != {"warnings", "failures"} \
            or not isinstance(undo["warnings"], list) or not isinstance(undo["failures"], list):
        _bad("undo fields mismatch")
    if record["error"] is not None and not isinstance(record["error"], (dict, str)):
        _bad("error must be null, object or string")


def _dir(root):
    return Path(root) / DIR_NAME


def _path(root, project_id):
    _check_id(project_id)
    return _dir(root) / (project_id + ".json")


def read_record(root, project_id):
    """記録を返す。無ければ None。壊れていれば RECORD_UNREADABLE（ファイルは変更しない）。"""
    path = _path(root, project_id)
    try:
        if not path.exists():
            return None
        if path.stat().st_size > MAX_BYTES:
            raise LegacyImportError("RECORD_UNREADABLE")
        data = json.loads(path.read_text(encoding="utf-8"))
        validate_record(data, project_id)
    except LegacyImportError:
        raise
    except (OSError, ValueError, RecordInvalid):  # RecordInvalid・JSONDecodeErrorは ValueError の子
        raise LegacyImportError("RECORD_UNREADABLE")
    return data


def write_record(root, project_id, record):
    """検査して原子的に保存する。6MB超は RECORD_TOO_LARGE で書かない。
    既存ファイルが壊れていれば RECORD_UNREADABLE で上書きしない。"""
    validate_record(record, project_id)
    size = len(json.dumps(record, ensure_ascii=False, indent=2).encode("utf-8"))
    if size > MAX_BYTES:
        raise LegacyImportError("RECORD_TOO_LARGE")
    read_record(root, project_id)  # 壊れた既存ファイルを上書きしない
    _atomic(_path(root, project_id), record)


def archive_record(root, project_id, now):
    """現在の記録を history/<作品ID>-<UTC時刻 YYYYMMDDThhmmssZ>.json へ移す。消さない。
    記録が無ければ None、移したら移し先のパスを返す。同名があれば -2, -3… を付けて上書きしない。"""
    if not isinstance(now, datetime):
        raise TypeError("now must be a datetime")
    if now.tzinfo is not None:
        now = now.astimezone(timezone.utc)
    if read_record(root, project_id) is None:
        return None
    stamp = now.strftime("%Y%m%dT%H%M%SZ")
    hist = _dir(root) / HISTORY_NAME
    hist.mkdir(parents=True, exist_ok=True)
    dest = hist / ("%s-%s.json" % (project_id, stamp))
    n = 2
    while dest.exists():
        dest = hist / ("%s-%s-%d.json" % (project_id, stamp, n))
        n += 1
    os.replace(_path(root, project_id), dest)
    return dest
