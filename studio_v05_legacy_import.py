"""旧Studioの保存状態（スナップショット）をv0.5の作品へ写す取込の、確認（plan）の純関数。

設計: docs/roadmap/LEGACY_STATE_TO_V05_MAPPING_DESIGN_20261104_JA.md の WP-L1（要件 DATA-008）。
この段階ではファイルを読まず、書かない。`plan()` は渡された入力だけから結果を作り、同じ入力には同じ出力を返す。
曲とダンス（S1〜S6）と旧タイムライン編集（T1〜T4）は WP-L7a・L7b で足す。
"""
from __future__ import annotations

import copy
import struct

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
