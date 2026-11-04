"""旧Studioの保存状態（スナップショット）をv0.5の作品へ写す取込の、確認（plan）の純関数。

設計: docs/roadmap/LEGACY_STATE_TO_V05_MAPPING_DESIGN_20261104_JA.md の WP-L1（要件 DATA-008）。
`plan()` は渡された入力だけから結果を作り、同じ入力には同じ出力を返す（ファイルに触れない）。
WP-L3 で `collect`・`apply`・`undo_journal`・`revert` を足した（ファイルを読み書きするのはこの4つだけ）。
曲とダンス（S1〜S6）と旧タイムライン編集（T1〜T4）は WP-L7a・L7b で足す。
"""
from __future__ import annotations

import copy
import hashlib
import json
import struct
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import studio_project_catalog
import studio_project_snapshots
import studio_v05_arrangement
import studio_v05_multi_motion
import studio_v05_playhead
import studio_v05_scene_instances
import studio_v05_scene_model
import studio_v05_track_layout
from project_state_bundle import validate_bundle
from studio_v05_scene_model import supported_model

FPS_POLICIES = ("keep_if_same", "use_legacy")
INCLUDES = ("music_dance", "timeline_editor")
PLAYHEAD_MAX_SECONDS = 86400
ASSET_PREFIXES = ("integrated:", "mmd:", "fbx:", "library:")
CAMERA_EXTRAS = ("easingPresets", "custom_presets", "sequence", "rig", "focus_tracking", "bone_follow")
COMBINATION_KNOWN = ("history", "cursor", "title", "selected", "playbackSpeed", "updatedAt")
DEFAULT_TRANSFORM = {"position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]}

# §3.4 理由コードと画面の文（全文）。
MESSAGES = {
    'UNIT_SEMANTICS_DIFFER': '位置・回転・大きさの数値は写しました。v0.5は読み込むときに大きさや足の位置を合わせるため、旧画面と見た目が違うことがあります。',
    'PLACED_AT_ORIGIN': '曲とダンスの画面のモデルは位置を保存していないため、原点に置きました。',
    'MOTION_TARGET_UNSET': '動作のクリップは置きましたが、動かすキャラクターを決められませんでした。クリップを開いて［対象モデルを保存］で選んでください。',
    'NAME_DUPLICATE_LAST_WINS': '同じ名前の動作が複数あります。旧画面と同じく、後から登録したものを使いました。',
    'BLEND_DROPPED': '動作のつなぎ（補間フレーム）はv0.5にまだ無いため、使いませんでした。値は取込記録に残しました。',
    'FPS_KEPT_USER_CHANGE': '取込のあとで作品のFPSが変えられていたため、FPSはいまの値のままにしました。',
    'NO_V05_FIELD': 'v0.5にはこの設定の保存先がまだありません。元の値は取込記録に残しました。',
    'CAMERA_KEYS_NOT_SUPPORTED': 'v0.5のカメラは、時刻付きの動きをまだ保存できません。カメラのキー{n}件は取込記録に残しました。',
    'NO_TIMING': '旧の動作の並びには開始時刻と長さがないため、タイムラインへは置きませんでした。',
    'NAME_UNRESOLVED': 'この動作名に当たる登録素材が見つかりません。',
    'ASSET_MISSING': '素材「{name}」が登録一覧にないか、元のファイルが見つかりません。別の素材への置き換えはしません。',
    'ASSET_UNSUPPORTED': '素材「{name}」は、この場所には置けない形式です。',
    'DURATION_UNKNOWN': '素材「{name}」の長さを読み取れないため、タイムラインへは置きませんでした。',
    'SOURCE_OFFSET_NOT_SUPPORTED': 'ダンスを途中から始める設定は、v0.5の動作クリップではまだ使えません。',
    'SPEED_NOT_SUPPORTED': '再生速度を変えた動作は、v0.5ではまだ置けません。',
    'OUT_OF_RANGE': '値がv0.5で扱える範囲の外です（再生位置は24時間まで）。',
    'UNKNOWN_FIELD': '旧画面が保存した、この取込処理の知らない項目です。元の値をそのまま残しました。',
    'LIVE_SOURCE_INVALID': 'このファイルは形が正しくないため、取り込みませんでした。元のファイルはそのままです。',
    'FPS_CONFLICT': '作品のFPS（{project}fps）と旧保存のFPS（{legacy}fps）が違います。［作品のFPSを{legacy}fpsに変えて取り込む］を押すと、作品のFPSを変えてから取り込みます。',
    'TARGET_NOT_EMPTY': 'この作品には、すでにクリップか3D場面があります。ホームの［＋ 新規作成］で空の作品を作り、その作品カードで［現行編集を保存］→［旧保存を取り込む…］の順に押してください。',
    'ALREADY_IMPORTED': 'この作品には取込済みです。やり直すときは、［取込を取消］を押してから、もう一度［取り込む］を押してください。',
    'SOURCE_CHANGED': '確認したあとに、スナップショットか曲とダンスなどの保存が変わりました。［もう一度確認する］を押してください。',
    'TARGET_CHANGED': '確認したあとに、この作品が別の画面で変更されました。［もう一度確認する］を押してください。',
    'IMPORT_INTERRUPTED': '前回の取込または取消が途中で止まっています。［取込を取消］を押して、取込前に戻してください。',
    'NOTHING_TO_REVERT': 'この作品には取り消せる取込がありません。',
    'REVERT_BLOCKED': '取り消すと、あとから加えた次の内容も消えるため、止めました：{list}。先にこれらを外してから［取込を取消］を押してください。',
    'LEGACY_SLOT_CHANGED': 'この作品の旧1体枠が、取込のあとで変わりました。3D場面を開いて状態を確かめてから、もう一度操作してください。',
    'NO_SNAPSHOT': 'この作品にはスナップショットがありません。作品カードの［現行編集を保存］を先に押してください。',
    'PROJECT_NOT_FOUND': '作品が見つかりません。ホームの一覧を開き直してください。',
    'BAD_REQUEST': '取込の要求の形が正しくありません。画面を開き直してください。',
    'REQUEST_TOO_LARGE': '取込の要求が大きすぎます。画面を開き直してください。',
    'SNAPSHOT_UNREADABLE': 'スナップショットを読めません。元のファイルはそのままです。作品カードの［現行編集を保存］をもう一度押してください。',
    'RECORD_UNREADABLE': '取込記録を読めません。元のファイルはそのままです。診断ZIPを保存して開発者に渡してください。',
    'RECORD_TOO_LARGE': '取込記録が6MBを超えるため、取り込めません。カメラのキーや動作の並びが非常に多い可能性があります。',
    'APPLY_FAILED': '取込の途中でファイル操作に失敗しました。{rolled}。',
    'UNDO_FAILED': '取消の一部ができませんでした：{list}。［取込を取消］をもう一度押してください。直らないときは診断ZIPを保存してください。',
}

# 区分（警告・保管・拒否・失敗）。
KINDS = {
    'UNIT_SEMANTICS_DIFFER': '警告',
    'PLACED_AT_ORIGIN': '警告',
    'MOTION_TARGET_UNSET': '警告',
    'NAME_DUPLICATE_LAST_WINS': '警告',
    'BLEND_DROPPED': '警告',
    'FPS_KEPT_USER_CHANGE': '警告（取消時）',
    'NO_V05_FIELD': '保管',
    'CAMERA_KEYS_NOT_SUPPORTED': '保管',
    'NO_TIMING': '保管',
    'NAME_UNRESOLVED': '保管',
    'ASSET_MISSING': '保管',
    'ASSET_UNSUPPORTED': '保管',
    'DURATION_UNKNOWN': '保管',
    'SOURCE_OFFSET_NOT_SUPPORTED': '保管',
    'SPEED_NOT_SUPPORTED': '保管',
    'OUT_OF_RANGE': '保管',
    'UNKNOWN_FIELD': '保管',
    'LIVE_SOURCE_INVALID': '保管',
    'FPS_CONFLICT': '拒否',
    'TARGET_NOT_EMPTY': '拒否',
    'ALREADY_IMPORTED': '拒否',
    'SOURCE_CHANGED': '拒否',
    'TARGET_CHANGED': '拒否',
    'IMPORT_INTERRUPTED': '拒否',
    'NOTHING_TO_REVERT': '拒否',
    'REVERT_BLOCKED': '拒否',
    'LEGACY_SLOT_CHANGED': '拒否',
    'NO_SNAPSHOT': '拒否',
    'PROJECT_NOT_FOUND': '拒否',
    'BAD_REQUEST': '拒否',
    'REQUEST_TOO_LARGE': '拒否',
    'SNAPSHOT_UNREADABLE': '拒否',
    'RECORD_UNREADABLE': '拒否',
    'RECORD_TOO_LARGE': '拒否',
    'APPLY_FAILED': '失敗',
    'UNDO_FAILED': '失敗',
}

# HTTP状態（警告・保管は無し）。
STATUS = {
    'FPS_CONFLICT': 409,
    'TARGET_NOT_EMPTY': 409,
    'ALREADY_IMPORTED': 409,
    'SOURCE_CHANGED': 409,
    'TARGET_CHANGED': 409,
    'IMPORT_INTERRUPTED': 409,
    'NOTHING_TO_REVERT': 409,
    'REVERT_BLOCKED': 409,
    'LEGACY_SLOT_CHANGED': 409,
    'NO_SNAPSHOT': 404,
    'PROJECT_NOT_FOUND': 404,
    'BAD_REQUEST': 400,
    'REQUEST_TOO_LARGE': 413,
    'SNAPSHOT_UNREADABLE': 422,
    'RECORD_UNREADABLE': 422,
    'RECORD_TOO_LARGE': 422,
    'APPLY_FAILED': 500,
    'UNDO_FAILED': 500,
}

# §3.5 画面に出す表示名。{name}・{n}・{key} は plan が埋める。
LABELS = {
    "M1": "作品のFPS",
    "M2": "再生位置",
    "M3": "キャラクター「{name}」",
    "M4": "ステージ「{name}」",
    "M5": "GLBに入っているアニメの番号",
    "M6": "照明",
    "M7": "カメラの動き（キー{n}件）",
    "M8": "カメラの補間・プリセット・ショット・リグ・追従の設定",
    "M9": "動作の並び（{n}件）",
    "M10": "動作の並びの編集履歴・選択などの状態",
    "M11": "旧画面の不明な項目「{key}」",
    "S1": "ダンスのモデル「{name}」",
    "S2": "曲「{name}」",
    "S3": "ダンス「{name}」",
    "T2": "旧タイムラインの動作「{name}」",
    "scene_store": "3D場面",
    "arrangement_store": "タイムライン",
}


class LegacyImportError(ValueError):
    """取込の拒否・失敗。`message` は MESSAGES の文（{...} は params で埋める）。"""

    def __init__(self, code, **params):
        self.code = code
        self.status = STATUS.get(code)
        self.params = params
        self.message = MESSAGES[code].format(**params)
        self.state = None  # 適用・取消が失敗したときの記録の state（rolled_back / undo_failed）
        super().__init__(self.message)


def vmd_last_frame(raw: bytes) -> int:
    """VMDの骨キー・表情キーのフレーム番号の最大値（§5.8）。キー0件・長さ不足は ValueError。"""
    if not isinstance(raw, (bytes, bytearray)):
        raise ValueError("VMD must be bytes")
    pos = 50  # ヘッダ30 + モデル名20
    last = -1
    for size in (111, 23):  # 骨キー、表情キー。フレーム番号は各レコードの15バイト目から
        if len(raw) < pos + 4:
            raise ValueError("VMD truncated")
        (count,) = struct.unpack_from("<I", raw, pos)
        pos += 4
        if len(raw) < pos + size * count:
            raise ValueError("VMD truncated")
        for i in range(count):
            (frame,) = struct.unpack_from("<I", raw, pos + size * i + 15)
            last = max(last, frame)
        pos += size * count
    if last < 0:
        raise ValueError("VMD has no keys")
    return last


def _presence(parent, key):
    if key not in parent:
        return "absent"
    return "null" if parent[key] is None else "value"


def _ptr(key):
    return str(key).replace("~", "~0").replace("/", "~1")


def _tail(asset_id):
    return asset_id.rsplit(":", 1)[-1]


def _display_name(asset_id, index):
    entry = index.get(asset_id)
    name = entry.get("name") if isinstance(entry, dict) else None
    return name or _tail(asset_id)


def _normalize_ref(asset):
    return asset if asset.startswith(ASSET_PREFIXES) else "integrated:" + asset


def _transform(legacy):
    """旧の配置 {position, rotation, scale(数1つ)} → v0.5の transform。None は既定値。"""
    if legacy is None:
        return copy.deepcopy(DEFAULT_TRANSFORM)
    s = legacy["scale"]
    return {"position": list(legacy["position"]), "rotation": list(legacy["rotation"]), "scale": [s, s, s]}


def _fmt_fps(value):
    return "%g" % float(value)


def _empty_result(reject, source_info, expected, presence):
    return {
        "ok": False, "reject": reject, "source_info": source_info,
        "summary": {"mapped": [], "kept": [], "warnings": 0, "mapped_count": 0, "kept_count": 0},
        "items": [], "steps": [], "expected": expected, "presence": presence, "assets": [],
    }


def _reject(code, **params):
    e = LegacyImportError(code, **params)
    return {"code": code, "status": e.status, "message": e.message, "params": params}


def plan(inputs, *, include=(), fps_policy="keep_if_same"):
    """旧保存をv0.5へ写す計画を作る（何も書かない）。形は設計書 §5.1。"""
    if fps_policy not in FPS_POLICIES:
        raise LegacyImportError("BAD_REQUEST")
    include = tuple(include)
    if any(x not in INCLUDES for x in include):
        raise LegacyImportError("BAD_REQUEST")

    snap = inputs["snapshot"]
    bundle = snap["bundle"]
    camera, combo, ws = bundle["camera"], bundle["combination"], bundle.get("workspace")
    target = inputs["target"]
    index = {a["id"]: a for a in inputs.get("assets", []) if isinstance(a, dict) and "id" in a}
    live = inputs.get("live") or {}

    presence = {"/workspace": _presence(bundle, "workspace")}
    if ws is not None:
        for key in ("character", "stage", "lights"):
            presence["/workspace/" + key] = _presence(ws, key)

    def sha_of(name):
        item = live.get(name) if name in include else None
        return item["sha256"] if item else None

    expected = {
        "snapshot_sha256": snap["sha256"], "fps": copy.deepcopy(target["fps"]),
        "scene_revision": target["scene"]["revision"], "arrangement_revision": target["arrangement"]["revision"],
        "live_sha256": {"music_dance": sha_of("music_dance"), "timeline_editor": sha_of("timeline_editor")},
    }

    def name_of(asset):
        return _display_name(_normalize_ref(asset), index) if asset else "なし"

    source_info = {
        "title": combo.get("title") or "（名前なし）",
        "snapshot_saved_at": snap["saved_at"],
        "character": name_of(ws["asset"]) if ws else "なし",
        "stage": name_of(ws["stage"]["asset"]) if ws and ws.get("stage") else "なし",
        "music_dance_updated": None, "timeline_editor_updated": None,
    }

    # 1. 記録の状態  2. 空でない作品  3. FPS の食い違い（この順で最初に当たったもので拒否）
    state = target.get("record_state")
    if state not in (None, "applied", "applying", "reverting", "undo_failed", "reverted", "rolled_back"):
        raise LegacyImportError("BAD_REQUEST")
    if state == "applied":
        return _empty_result(_reject("ALREADY_IMPORTED"), source_info, expected, presence)
    if state in ("applying", "reverting", "undo_failed"):
        return _empty_result(_reject("IMPORT_INTERRUPTED"), source_info, expected, presence)
    scene, arr = target["scene"], target["arrangement"]
    if (arr["clips"] or scene["instances"] or scene["camera"] is not None or scene["face_keys"]
            or target["scene_model"]["model"] is not None):
        return _empty_result(_reject("TARGET_NOT_EMPTY"), source_info, expected, presence)

    legacy_fps = camera["fps"]
    tf = target["fps"]
    fps_step = None
    if tf["presence"] == "absent" or (
            float(tf["value"]) != float(legacy_fps) and fps_policy == "use_legacy"):
        fps_step = {"kind": "fps", "status": "pending", "before": copy.deepcopy(tf), "after": legacy_fps}
    elif float(tf["value"]) != float(legacy_fps):
        return _empty_result(
            _reject("FPS_CONFLICT", project=_fmt_fps(tf["value"]), legacy=_fmt_fps(legacy_fps)),
            source_info, expected, presence)

    items, scene_steps, play_steps, assets_out = [], [], [], []

    def add(iid, pointer, label_key, status, codes, legacy_value, step=None, **fmt):
        params = dict(fmt)
        items.append({
            "id": iid, "pointer": pointer, "label": LABELS[label_key].format(**params), "status": status,
            "codes": list(codes), "messages": [MESSAGES[c].format(**params) for c in codes],
            "legacy_value": copy.deepcopy(legacy_value), "step": step,
        })
        return items[-1]

    def kept(iid, pointer, label_key, code, legacy_value, **fmt):
        add(iid, pointer, label_key, "kept", [code], legacy_value, **fmt)

    def place(iid, label_key, role, pointer, asset, legacy_value, legacy_transform):
        """素材をv0.5の場面インスタンスの手順にする。置けなければ理由付きで保管。"""
        asset_id = _normalize_ref(asset)
        name = _display_name(asset_id, index)
        entry = index.get(asset_id)
        if entry is None or not entry.get("available"):
            return kept(iid, pointer, label_key, "ASSET_MISSING", legacy_value, name=name)
        if not supported_model(entry):
            return kept(iid, pointer, label_key, "ASSET_UNSUPPORTED", legacy_value, name=name)
        step = {"kind": "scene_add", "role": role, "status": "pending", "asset_id": asset_id,
                "transform": _transform(legacy_transform), "pre_ids": [], "instance_id": None}
        scene_steps.append(step)
        assets_out.append({"asset_id": asset_id, "legacy_ref": asset, "sha256": None})
        item = add(iid, pointer, label_key, "mapped", ["UNIT_SEMANTICS_DIFFER"], legacy_value, name=name)
        item["_step"] = step

    # M1
    if fps_step is not None:
        add("M1", "/camera/fps", "M1", "mapped", [], legacy_fps)["_step"] = fps_step
    if ws is not None:
        # M2
        seconds = round(ws["frame"] / legacy_fps, 4)
        if seconds > PLAYHEAD_MAX_SECONDS:
            kept("M2", "/workspace/frame", "M2", "OUT_OF_RANGE", {"frame": ws["frame"], "fps": legacy_fps})
        else:
            step = {"kind": "playhead", "status": "pending", "seconds": seconds}
            play_steps.append(step)
            add("M2", "/workspace/frame", "M2", "mapped", [], ws["frame"])["_step"] = step
        # M3
        character = ws.get("character")
        value3 = {"asset": ws["asset"]}
        if "character" in ws:
            value3["character"] = character
        if ws["asset"]:
            place("M3", "M3", "character", "/workspace/asset", ws["asset"], value3, character)
        elif character is not None:
            add("M3", "/workspace/character", "M3", "kept", ["NO_V05_FIELD"], {"character": character},
                name="（モデルなし）")
        # M4
        if ws.get("stage") is not None:
            stage = ws["stage"]
            place("M4", "M4", "stage", "/workspace/stage", stage["asset"], stage, stage)
        # M5, M6
        if ws["clip"] is not None:
            kept("M5", "/workspace/clip", "M5", "NO_V05_FIELD", ws["clip"])
        if ws.get("lights") is not None:
            kept("M6", "/workspace/lights", "M6", "NO_V05_FIELD", ws["lights"])
    # M7, M8
    kept("M7", "/camera/keys", "M7", "CAMERA_KEYS_NOT_SUPPORTED",
         {"keys": camera["keys"], "duration": camera["duration"]}, n=len(camera["keys"]))
    for key in CAMERA_EXTRAS:
        if key in camera:
            kept("M8", "/camera/" + key, "M8", "NO_V05_FIELD", camera[key])
    # M9, M10, M11
    if combo["timeline"]:
        kept("M9", "/combination/timeline", "M9", "NO_TIMING", combo["timeline"], n=len(combo["timeline"]))
    for key in COMBINATION_KNOWN:
        if key in combo:
            kept("M10", "/combination/" + key, "M10", "NO_V05_FIELD", combo[key])
    for key in combo:
        if key not in ("schema", "timeline") and key not in COMBINATION_KNOWN:
            kept("M11", "/combination/" + _ptr(key), "M11", "UNKNOWN_FIELD", combo[key], key=key)

    # 手順の順番は「fps → scene_add → playhead」。ここで番号を振る。
    steps = ([fps_step] if fps_step else []) + scene_steps + play_steps
    out_steps = []
    for n, step in enumerate(steps, 1):
        out_steps.append({"n": n, **step})
        step["_n"] = n
    for item in items:
        st = item.pop("_step", None)
        item["step"] = st["_n"] if st else None
    for step in steps:
        step.pop("_n", None)

    def uniq(labels):
        return list(dict.fromkeys(labels))

    mapped = [i["label"] for i in items if i["status"] == "mapped"]
    kept_labels = [i["label"] for i in items if i["status"] == "kept"]
    return {
        "ok": True, "reject": None, "source_info": source_info,
        "summary": {"mapped": uniq(mapped), "kept": uniq(kept_labels),
                    "warnings": sum(1 for i in items for c in i["codes"] if KINDS[c] == "警告"),
                    "mapped_count": len(mapped), "kept_count": len(kept_labels)},
        "items": items, "steps": out_steps, "expected": expected, "presence": presence, "assets": assets_out,
    }


# ======================================================================================
# WP-L3: 収集（collect）・適用（apply）・打ち消し（undo_journal）・取消（revert）
# 設計 §5.1〜§5.4。v0.5の保存へは既存の公開関数だけを通して書く（バイト列の書き戻しはしない）。
# ロック: モジュールの _LOCK を取る。サーバー（server.py:64 の PROJECT_LOCK）は WP-L5 で外側に取る
# （server.py:1484 の snapshot と同じ `with PROJECT_LOCK:`）。他のストアの内部ロックは取らない。
# ======================================================================================
_LOCK = threading.RLock()
UNDO_ATTEMPTS = 3
_EXPECTED_KEYS = {"snapshot_sha256", "fps", "scene_revision", "arrangement_revision", "live_sha256"}
_ROLE_JA = {"character": "キャラクター", "stage": "ステージ", "dance_model": "ダンスのモデル"}
_TRACK_JA = {"motion": "動作", "music": "音楽", "audio": "音声"}


def event(name, level="info", **fields):
    """OBS-004 の操作ログ。記録に失敗しても取込・取消を止めない。試験は monkeypatch で差し替える。"""
    try:
        import diagnostic_logging
        diagnostic_logging.event(name, level, **fields)
    except Exception:  # noqa: BLE001 - ログの失敗で本処理を壊さない
        pass


def _now():
    return datetime.now(timezone.utc)


def _rec():
    import studio_v05_legacy_import_record as record_store  # 循環 import を避けるため遅延
    return record_store


class _Roots:
    """作品データの置き場所（data_root 直下の固定名。サーバーの DATA/'studio_v05_...' と同じ）。"""

    def __init__(self, data_root):
        self.data = Path(data_root)
        self.catalog = self.data / "studio_v05_catalog.json"
        self.snapshots = self.data / "studio_v05_snapshots"
        self.scene = self.data / "studio_v05_scene_instances"
        self.legacy = self.data / "studio_v05_scene_models"
        self.arr = self.data / "studio_v05_arrangements"
        self.playhead = self.data / "studio_v05_playheads"
        self.layouts = self.data / "studio_v05_track_layouts"


def _project_row(roots, project_id):
    if not isinstance(project_id, str) or len(project_id) != 36:
        raise LegacyImportError("PROJECT_NOT_FOUND")
    row = next((p for p in studio_project_catalog.load(roots.catalog)["projects"] if p["id"] == project_id), None)
    if row is None:
        raise LegacyImportError("PROJECT_NOT_FOUND")
    return row


def _read_scene(roots, project_id):
    try:
        return studio_v05_scene_instances.read(roots.scene, roots.legacy, roots.catalog, project_id)
    except studio_v05_scene_instances.SceneInstancesError as exc:
        if "Legacy scene changed" in str(exc):
            raise LegacyImportError("LEGACY_SLOT_CHANGED") from exc
        raise


def collect(data_root, project_id, include, assets, manifest, asset_path):
    """plan() に渡す inputs を作る（読むだけ。§5.1）。

    WP-L3 の範囲: スナップショット（バイト列を1回だけ読み、同じバイト列からSHA-256とJSONを得る）と
    対象作品の現在の状態、取込記録の状態。曲とダンス・旧タイムライン編集の読み込みと長さの取得は
    WP-L7a・L7b で足すため、いまは live を常に None、durations を空で返す。
    """
    roots = _Roots(data_root)
    _project_row(roots, project_id)
    snap_path = roots.snapshots / (project_id + ".json")
    with studio_project_snapshots.LOCK:
        if not snap_path.exists():
            raise LegacyImportError("NO_SNAPSHOT")
        try:
            if snap_path.stat().st_size > studio_project_snapshots.MAX_BYTES:
                raise LegacyImportError("SNAPSHOT_UNREADABLE")
            raw = snap_path.read_bytes()
        except OSError as exc:
            raise LegacyImportError("SNAPSHOT_UNREADABLE") from exc
    try:
        obj = json.loads(raw.decode("utf-8"))
        if obj.get("schema") != 1 or obj.get("project_id") != project_id or not isinstance(obj.get("saved_at"), str):
            raise ValueError("invalid snapshot")
        bundle = validate_bundle(obj["bundle"])
    except (ValueError, KeyError, TypeError, AttributeError) as exc:
        raise LegacyImportError("SNAPSHOT_UNREADABLE") from exc
    row = _project_row(roots, project_id)
    fps = {"presence": "value", "value": row["fps"]} if "fps" in row else {"presence": "absent"}
    scene = _read_scene(roots, project_id)
    model = studio_v05_scene_model.read(roots.legacy, roots.catalog, project_id)
    arr = studio_v05_arrangement.read(roots.arr, roots.catalog, project_id)
    record = _rec().read_record(roots.data, project_id)
    return {
        "project_id": project_id,
        "snapshot": {"saved_at": obj["saved_at"], "sha256": hashlib.sha256(raw).hexdigest(), "bundle": bundle},
        "target": {
            "fps": fps,
            "scene": {"revision": scene["revision"], "instances": scene["instances"], "camera": scene["camera"],
                      "face_keys": scene["face_keys"]},
            "scene_model": {"model": model["model"]},
            "arrangement": {"revision": arr["revision"], "clips": arr["clips"]},
            "record_state": record["state"] if record else None,
        },
        "live": {"music_dance": None, "timeline_editor": None},
        "assets": assets,
        "manifest": manifest,
        "durations": {},
    }


# ---- 記録の保存 -------------------------------------------------------------------------
def _save(roots, record):
    record["updated_at"] = _now().isoformat()
    _rec().write_record(roots.data, record["project_id"], record)


def _step_label(record, step):
    for it in record["items"]:
        if it.get("step") == step["n"]:
            return it["label"]
    kind = step["kind"]
    if kind == "fps":
        return LABELS["M1"]
    if kind == "playhead":
        return LABELS["M2"]
    if kind == "scene_add":
        return LABELS["scene_store"]
    return LABELS["arrangement_store"]


def _is_conflict(exc):
    return "revision conflict" in str(exc).lower()


def _fps_equal(current, value):
    return current["presence"] == "value" and float(current["value"]) == float(value)


def _current_fps(roots, project_id):
    row = _project_row(roots, project_id)
    return {"presence": "value", "value": row["fps"]} if "fps" in row else {"presence": "absent"}


class _TargetChanged(Exception):
    """適用中に、確認したときの作品の状態と食い違った（409 TARGET_CHANGED）。"""


# ---- 手順の実行（apply） ----------------------------------------------------------------
def _by_n(record, n):
    return next((s for s in record["steps"] if s["n"] == n), None)


def _run_step(roots, record, step, assets, expected_fps):
    pid = record["project_id"]
    kind = step["kind"]
    if kind == "fps":
        with studio_project_catalog.LOCK:
            if _current_fps(roots, pid) != expected_fps:
                raise _TargetChanged("fps changed")  # started を付ける前なので、打ち消しは何も触らない
            step["started"] = True
            _save(roots, record)
            studio_project_catalog.set_fps(roots.catalog, pid, step["after"])
    elif kind == "scene_add":
        before = studio_v05_scene_instances.read(roots.scene, roots.legacy, roots.catalog, pid)
        pre = [i["id"] for i in before["instances"]]
        step["pre_ids"] = pre
        step["started"] = True
        _save(roots, record)  # 直前に pre_ids と started を残す（止まったとき相手を特定するため）
        after = studio_v05_scene_instances.mutate(
            roots.scene, roots.legacy, roots.catalog, pid, action="add", revision=before["revision"],
            assets=assets, asset_id=step["asset_id"], transform=step["transform"])
        new = [i["id"] for i in after["instances"] if i["id"] not in set(pre)]
        if len(new) != 1:
            raise RuntimeError("scene_add did not produce exactly one new instance")
        step["instance_id"] = new[0]
    elif kind == "clip_place":
        before = studio_v05_arrangement.read(roots.arr, roots.catalog, pid)
        pre = [c["id"] for c in before["clips"]]
        step["pre_ids"] = pre
        step["started"] = True
        _save(roots, record)
        result = studio_v05_arrangement.place(
            roots.arr, roots.catalog, pid, step["asset_id"], step["track"], step["start"], step["duration"],
            before["revision"], assets, layout_root=roots.layouts, source_duration=step.get("source_duration"),
            source_has_audio=step.get("source_has_audio"))
        step["clip_id"] = result["clip"]["id"]
    elif kind == "clip_source":
        clip_id = _by_n(record, step["clip_step"])["clip_id"]
        arr = studio_v05_arrangement.read(roots.arr, roots.catalog, pid)
        clip = next((c for c in arr["clips"] if c["id"] == clip_id), None)
        if clip is None:
            raise RuntimeError("clip not found for clip_source")
        studio_v05_arrangement.edit_clip(
            roots.arr, roots.catalog, pid, clip_id, arr["revision"], "update", start=clip["start"],
            duration=clip["duration"], track=clip["track"], source_start=step["source_start"],
            layout_root=roots.layouts)
    elif kind == "clip_assign":
        clip_id = _by_n(record, step["clip_step"])["clip_id"]
        instance_id = _by_n(record, step["instance_step"])["instance_id"]
        if not clip_id or not instance_id:
            raise RuntimeError("clip_assign needs the clip and the instance")
        arr = studio_v05_arrangement.read(roots.arr, roots.catalog, pid)
        studio_v05_multi_motion.assign(
            roots.arr, roots.scene, roots.legacy, roots.catalog, pid, clip_id, arr["revision"], instance_id,
            assets, layout_root=roots.layouts)
    elif kind == "playhead":
        cur = studio_v05_playhead.read(roots.playhead, roots.catalog, pid)
        studio_v05_playhead.update(roots.playhead, roots.catalog, pid, step["seconds"], cur["revision"])
    else:  # pragma: no cover - validate_record が弾く
        raise RuntimeError("unknown step kind")
    step["status"] = "done"
    _save(roots, record)


def _sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def _asset_sha(asset_path, asset_id):
    try:
        path = asset_path(asset_id)
        return _sha256_file(path) if path is not None else None
    except Exception:  # noqa: BLE001 - 読めない素材は null（§5.2 の3）
        return None


def _check_request(request, required, optional=()):
    if not isinstance(request, dict) or not set(required) <= set(request) or set(request) - set(required) - set(optional):
        raise LegacyImportError("BAD_REQUEST")
    if request.get("confirm") is not True:
        raise LegacyImportError("BAD_REQUEST")
    if not isinstance(request.get("id"), str):
        raise LegacyImportError("BAD_REQUEST")
    return request


def _raise_reject(reject):
    raise LegacyImportError(reject["code"], **reject.get("params", {}))


def apply(data_root, request, assets, manifest, asset_path):
    """旧保存をv0.5の作品へ写す（§5.2）。成功で {record, project}。拒否・失敗は LegacyImportError。"""
    req = _check_request(request, ("id", "expected", "confirm"), ("include", "fps_policy"))
    expected = req["expected"]
    if not isinstance(expected, dict) or set(expected) != _EXPECTED_KEYS or not isinstance(expected["fps"], dict) \
            or not isinstance(expected["live_sha256"], dict):
        raise LegacyImportError("BAD_REQUEST")
    include = req.get("include", [])
    fps_policy = req.get("fps_policy", "keep_if_same")
    if not isinstance(include, (list, tuple)):
        raise LegacyImportError("BAD_REQUEST")
    pid = req["id"]
    started = time.monotonic()
    roots = _Roots(data_root)
    with _LOCK:
        inputs = collect(data_root, pid, include, assets, manifest, asset_path)
        result = plan(inputs, include=include, fps_policy=fps_policy)
        reject = result["reject"]
        # 記録の状態による拒否は最優先。次に「確認したあとの変更」。その他の拒否は最後
        # （確認後に作品が変わったときは、拒否の理由より先に「もう一度確認する」を案内するため）。
        if reject and reject["code"] in ("ALREADY_IMPORTED", "IMPORT_INTERRUPTED"):
            _raise_reject(reject)
        cur = result["expected"]
        if expected["snapshot_sha256"] != cur["snapshot_sha256"] or expected["live_sha256"] != cur["live_sha256"]:
            raise LegacyImportError("SOURCE_CHANGED")
        if (expected["fps"] != cur["fps"] or expected["scene_revision"] != cur["scene_revision"]
                or expected["arrangement_revision"] != cur["arrangement_revision"]):
            raise LegacyImportError("TARGET_CHANGED")
        if reject:
            _raise_reject(reject)

        asset_rows = copy.deepcopy(result["assets"])
        for row in asset_rows:
            row["sha256"] = _asset_sha(asset_path, row["asset_id"])
        snap = inputs["snapshot"]  # plan と同じ1回の読み込み結果（SHA-256 と bundle は同じバイト列から）
        now = _now().isoformat()
        record = {
            "schema": 1, "project_id": pid, "state": "applying", "created_at": now, "updated_at": now,
            "source": {
                "snapshot": {"saved_at": snap["saved_at"], "sha256": snap["sha256"]},
                "bundle": copy.deepcopy(snap["bundle"]), "presence": result["presence"],
                "live": {"music_dance": None, "timeline_editor": None},
                "include": list(include), "fps_policy": fps_policy,
            },
            "target_before": {"fps": cur["fps"], "scene_revision": cur["scene_revision"],
                              "arrangement_revision": cur["arrangement_revision"]},
            "assets": asset_rows,
            "items": copy.deepcopy(result["items"]),
            "steps": copy.deepcopy(result["steps"]),
            "undo": {"warnings": [], "failures": []},
            "error": None,
        }
        store = _rec()
        if store.read_record(roots.data, pid) is not None:
            store.archive_record(roots.data, pid, _now())
        try:
            _save(roots, record)  # ここで失敗（RECORD_TOO_LARGE・OSError）したら、まだ何も写していない
        except LegacyImportError:
            raise
        except OSError as exc:
            e = LegacyImportError("APPLY_FAILED", rolled="取込前の状態に戻しました")
            e.state = "rolled_back"
            raise e from exc

        failure = None
        for step in record["steps"]:
            try:
                _run_step(roots, record, step, assets, expected["fps"])
            except Exception as exc:  # noqa: BLE001 - どの失敗も打ち消しへ進む
                failure = exc
                break
        if failure is None:
            record["state"] = "applied"
            try:
                _save(roots, record)
            except Exception as exc:  # noqa: BLE001 - 記録が最終化できなければ打ち消す
                failure = exc
                record["state"] = "applying"  # applied のまま error を付けて打ち消さない
        if failure is None:
            event("v05_legacy_import_apply", project_id=pid, state="applied", steps=len(record["steps"]),
                  duration_ms=int((time.monotonic() - started) * 1000))
            return {"record": record, "project": _project_row(roots, pid)}

        record["error"] = {"type": type(failure).__name__, "message": str(failure)}
        persisted = True
        try:
            _save(roots, record)
            undo_journal(data_root, record, assets)
            clean = all(s["status"] == "undone" for s in record["steps"])
            record["state"] = "rolled_back" if clean else "undo_failed"
            _save(roots, record)
        except Exception:  # noqa: BLE001 - 打ち消し中に記録を保存できなかった。ディスクの記録は applying のまま
            persisted = False
            clean = False
            record["state"] = "applying"
        event("v05_legacy_import_apply", level="warning", project_id=pid, state=record["state"],
              steps=len(record["steps"]), error=record["error"], duration_ms=int((time.monotonic() - started) * 1000))
        if isinstance(failure, _TargetChanged) or _is_conflict(failure):
            err = LegacyImportError("TARGET_CHANGED")
        else:
            rolled = ("取込前の状態に戻しました" if clean else "取込前に戻しきれませんでした。［取込を取消］を押してください")
            err = LegacyImportError("APPLY_FAILED", rolled=rolled)
        err.state = record["state"] if persisted else "applying"
        raise err from failure



# ---- 打ち消し（undo_journal） -----------------------------------------------------------
def _with_retry(fn):
    """「Revision conflict」なら読み直して最大 UNDO_ATTEMPTS 回やり直す。それ以外の例外はそのまま出す。"""
    last = None
    for _ in range(UNDO_ATTEMPTS):
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001
            if not _is_conflict(exc):
                raise
            last = exc
    raise last


def _find_target(rows, step, id_key, match):
    """打ち消す相手を探す。ID が分かっていればそれ、無ければ pre_ids に無く条件に合うもの。
    戻り値: ("none", None) | ("one", row) | ("many", None)"""
    known = step.get(id_key)
    if known:
        row = next((r for r in rows if r["id"] == known), None)
        return ("one", row) if row else ("none", None)
    pre = set(step.get("pre_ids", []))
    found = [r for r in rows if r["id"] not in pre and match(r)]
    if not found:
        return "none", None
    return ("one", found[0]) if len(found) == 1 else ("many", None)


def _undo_clip_place(roots, pid, step):

    def once():
        arr = studio_v05_arrangement.read(roots.arr, roots.catalog, pid)
        want = round(step["start"], 4)
        kind, clip = _find_target(
            arr["clips"], step, "clip_id",
            lambda c: c.get("asset_id") == step["asset_id"] and c.get("track") == step["track"]
            and c.get("start") == want)
        if kind == "none":
            return "undone", None
        if kind == "many":
            return "undo_failed", "打ち消す相手が複数あり、特定できません"
        studio_v05_arrangement.edit_clip(roots.arr, roots.catalog, pid, clip["id"], arr["revision"], "delete")
        return "undone", None
    return _with_retry(once)


def _undo_scene_add(roots, pid, step, assets):

    def once():
        scene = studio_v05_scene_instances.read(roots.scene, roots.legacy, roots.catalog, pid)
        kind, inst = _find_target(scene["instances"], step, "instance_id",
                                  lambda i: i["asset_id"] == step["asset_id"])
        if kind == "none":
            return "undone", None
        if kind == "many":
            return "undo_failed", "打ち消す相手が複数あり、特定できません"
        studio_v05_scene_instances.mutate(
            roots.scene, roots.legacy, roots.catalog, pid, action="remove", revision=scene["revision"],
            assets=assets, instance_id=inst["id"])
        return "undone", None
    return _with_retry(once)


def _undo_fps(roots, record, step):
    pid = record["project_id"]
    if step["status"] == "pending" and not step.get("started"):
        return "undone", None  # 始まっていない: 何も変えていない
    with studio_project_catalog.LOCK:
        cur = _current_fps(roots, pid)
        before = step["before"]
        if cur == before or (before["presence"] == "value" and _fps_equal(cur, before["value"])):
            return "undone", None  # もう元の値（または適用が届かなかった）
        if _fps_equal(cur, step["after"]):
            if before["presence"] == "absent":
                studio_project_catalog.clear_fps(roots.catalog, pid)
            else:
                studio_project_catalog.set_fps(roots.catalog, pid, before["value"])
            return "undone", None
    if step.get("started"):  # 始まっていない手順の FPS は、もともと利用者の値
        record["undo"]["warnings"].append(
            {"code": "FPS_KEPT_USER_CHANGE", "message": MESSAGES["FPS_KEPT_USER_CHANGE"]})
    return "undone", None  # いまの値は利用者の変更。戻さない


def undo_journal(data_root, record, assets):
    """日誌の手順を番号の大きい順に打ち消す（§5.3）。何度実行しても同じ結果になる。
    記録は手順ごとに保存する。state は変えない（呼び出し側が決める）。公開関数だけを通す。"""
    roots = _Roots(data_root)
    record["undo"]["failures"] = []
    for step in sorted(record["steps"], key=lambda s: -s["n"]):
        if step["status"] == "undone":
            continue
        kind = step["kind"]
        if step["status"] == "pending" and not step.get("started"):
            # 始まる直前の保存（started）が無い手順は、何も書いていない。探すと利用者が足した物を消しかねない
            step["status"] = "undone"
            _save(roots, record)
            continue
        pid = record["project_id"]
        try:
            if kind in ("playhead", "clip_assign", "clip_source"):
                status, reason = "undone", None
            elif kind == "clip_place":
                status, reason = _undo_clip_place(roots, pid, step)
            elif kind == "scene_add":
                status, reason = _undo_scene_add(roots, pid, step, assets)
            else:
                status, reason = _undo_fps(roots, record, step)
        except Exception as exc:  # noqa: BLE001 - 失敗は記録して次の手順へ（止めない）
            status, reason = "undo_failed", "%s: %s" % (type(exc).__name__, exc)
        step["status"] = status
        if status == "undo_failed":
            record["undo"]["failures"].append(
                {"n": step["n"], "kind": kind, "label": _step_label(record, step), "reason": reason})
        _save(roots, record)
    return record


# ---- 取消（revert） ---------------------------------------------------------------------
def _revert_blocked(roots, record):
    """applied の取消の事前点検（§5.4 の2）。取り消すと消えてしまう、あとから加えた内容の表示名を返す。"""
    pid = record["project_id"]
    role_of = {s["instance_id"]: s.get("role") for s in record["steps"]
               if s["kind"] == "scene_add" and s.get("instance_id")}
    mine_clips = {s["clip_id"] for s in record["steps"] if s["kind"] == "clip_place" and s.get("clip_id")}
    scene = _read_scene(roots, pid)
    arr = studio_v05_arrangement.read(roots.arr, roots.catalog, pid)
    layout = studio_v05_track_layout.get(roots.layouts, roots.catalog, pid)
    out = []

    def role_ja(iid):
        return _ROLE_JA.get(role_of.get(iid), "モデル")

    for iid in role_of:
        n = sum(1 for k in scene["face_keys"] if k["instance_id"] == iid)
        if n:
            out.append("取り込んだ%sの表情キー%d件" % (role_ja(iid), n))
    for inst in scene["instances"]:
        if inst["id"] in role_of and inst["locked"]:
            out.append("ロックされた%s" % role_ja(inst["id"]))
    for iid in role_of:
        n = sum(1 for c in arr["clips"] if c.get("target_scene_instance_id") == iid and c["id"] not in mine_clips)
        if n:
            out.append("取り込んだ%sを対象にした、あとから置いた動作のクリップ%d件" % (role_ja(iid), n))
    locked = set(layout.get("locked", []))
    for c in arr["clips"]:
        if c["id"] in mine_clips and c["track"] in locked:
            out.append("ロックされた%sのトラック" % _TRACK_JA.get(c["track"], c["track"]))
    return list(dict.fromkeys(out))


def revert(data_root, request, assets):
    """取り込んだものを打ち消す（§5.4）。成功で {record, project}。拒否・失敗は LegacyImportError。"""
    req = _check_request(request, ("id", "confirm"))
    pid = req["id"]
    started = time.monotonic()
    roots = _Roots(data_root)
    store = _rec()
    with _LOCK:
        _project_row(roots, pid)
        record = store.read_record(roots.data, pid)
        if record is None or record["state"] in ("reverted", "rolled_back"):
            raise LegacyImportError("NOTHING_TO_REVERT")
        origin = record["state"]
        if origin == "applied":
            blocked = _revert_blocked(roots, record)
            if blocked:
                raise LegacyImportError("REVERT_BLOCKED", list="、".join(blocked))
        elif origin == "applying" and record["error"] is None:
            # 適用が最後まで届かなかった記録。取消が失敗して undo_failed になっても、
            # 次の取消が rolled_back（取込は完成しなかった）で終わるよう印を残す。
            record["error"] = {"type": "ImportInterrupted", "message": "apply did not finish"}
        # error のある記録（適用が失敗した、または最後まで届かなかった）は、取込が完成しなかったので rolled_back で終える。
        never_completed = record["error"] is not None
        record["state"] = "reverting"
        _save(roots, record)
        try:
            undo_journal(data_root, record, assets)
            clean = all(s["status"] == "undone" for s in record["steps"])
            record["state"] = ("rolled_back" if never_completed else "reverted") if clean else "undo_failed"
            _save(roots, record)
        except Exception as exc:  # noqa: BLE001 - 保存できなかった。ディスクの記録は reverting のまま（再実行できる）
            event("v05_legacy_import_revert", level="warning", project_id=pid, state="reverting",
                  error={"type": type(exc).__name__, "message": str(exc)},
                  duration_ms=int((time.monotonic() - started) * 1000))
            err = LegacyImportError("UNDO_FAILED", list="取込記録の保存")
            err.state = "reverting"
            raise err from exc
        event("v05_legacy_import_revert", level="info" if clean else "warning", project_id=pid,
              state=record["state"], steps=len(record["steps"]), failures=len(record["undo"]["failures"]),
              duration_ms=int((time.monotonic() - started) * 1000))
        if not clean:
            err = LegacyImportError("UNDO_FAILED", list="、".join(f["label"] for f in record["undo"]["failures"]))
            err.state = "undo_failed"
            raise err
        return {"record": record, "project": _project_row(roots, pid)}
