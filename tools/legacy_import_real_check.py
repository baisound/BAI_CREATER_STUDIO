"""WP-L9 旧保存→v0.5取込の実データ確認（設計書 LEGACY_STATE_TO_V05_MAPPING_DESIGN_20261104_JA.md の WP-L9）。

使い方:
  python tools/legacy_import_real_check.py --data "D:\\BAI\\BAI_CREATER_STUDIO\\BAI_Creator_Studio\\data" --out "<出力フォルダ>"

所有者の data を読み取り専用で一時フォルダへ複製し、その複製だけを使う隔離サーバーで
確認 → 適用 → 記録の読込 → R2/R4（試験専用の逆変換）→ 再生位置を3回動かす → 取消（R3）を通す。
最後に元の data の SHA-256 を取り直して R1 を判定し、--out に report_JA.md と report.json を書く。
CHROMIUM_PATH（または --chromium）と Node.js があれば、適用は v0.5（③）の取込ダイアログから行い、
ダイアログ・タイムライン・3D場面の画像を --out に保存する。無ければ HTTP で適用し、画像は未検証と書く。
"""
import argparse
import copy
import hashlib
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

LEGACY_FILES = ["project_state.json", "camera_project.json", "project_state.workspace.json",
                "music_dance_project.json", "timeline_editor.json"]
INDEX_FILES = ["manifest.json", "mmd_assets.json", "integrated_v02/catalog.json", "integrated_v02/user_assets.json",
               "library_assets/index.json"]
PROJECT_NAME = "旧保存取込の実データ確認"


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def read_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


# ---- 参照している素材の原本を探す ------------------------------------------------------------
def referenced_files(data):
    """旧保存（ワークスペース・SCR-10・旧タイムライン編集）が参照する素材の、data からの相対パスの一覧。"""
    import studio_v05_legacy_import as L
    rel = set()
    ids = set()
    ws_path = data / "project_state.workspace.json"
    if ws_path.exists():
        ws = read_json(ws_path)
        ws = ws.get("workspace", ws) if isinstance(ws, dict) else {}
        if isinstance(ws, dict):
            if ws.get("asset"):
                ids.add(L._normalize_ref(ws["asset"]))
            if isinstance(ws.get("stage"), dict) and ws["stage"].get("asset"):
                ids.add(ws["stage"]["asset"])
    md_path = data / "music_dance_project.json"
    if md_path.exists():
        md = read_json(md_path)
        ids.update(md.get(k) for k in ("model_id", "motion_id", "audio_id") if md.get(k))
    manifest = read_json(data / "manifest.json") if (data / "manifest.json").exists() else {"files": []}
    te_path = data / "timeline_editor.json"
    if te_path.exists():
        names = {L._norm_name(c.get("name", "")) for c in read_json(te_path).get("clips", []) if isinstance(c, dict)}
        for entry in manifest.get("files", []):
            if L._norm_name(entry.get("name", "")) in names:
                ids.add("fbx:" + entry["id"])
    library = read_json(data / "library_assets" / "index.json")["items"] if (data / "library_assets" / "index.json").exists() else []
    mmd = read_json(data / "mmd_assets.json") if (data / "mmd_assets.json").exists() else {}
    for aid in sorted(ids):
        if aid.startswith("library:"):
            item = next((i for i in library if i.get("id") == aid), None)
            if item:
                rel.add("library_assets/files/" + item["filename"])
        elif aid.startswith("integrated:"):
            rel.add("integrated_v02/assets/" + aid[len("integrated:"):])
        elif aid.startswith("fbx:"):
            rel.add("files/" + aid[len("fbx:"):] + ".fbx")
        elif aid.startswith("mmd:"):
            slot, name = aid.split(":", 2)[1:]
            rel.add(f"mmd/{slot}/{name}")
            if slot in ("A", "B"):  # テクスチャ（mmd_assets.json の tex/ 以下）も一緒に複製する
                rel.update(f"mmd/{slot}/{row['name']}" for row in mmd.get(slot, []) if str(row.get("name", "")).startswith("tex/"))
    return sorted(r for r in rel if (data / r).is_file()), sorted(ids)


# ---- 隔離サーバー ----------------------------------------------------------------------------
def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Server:
    def __init__(self, data_dir, port):
        self.base = f"http://127.0.0.1:{port}"
        env = {**os.environ, "BAI_DATA_DIR": str(data_dir)}
        self.proc = subprocess.Popen([sys.executable, str(ROOT / "server.py"), str(port)], cwd=str(ROOT), env=env,
                                     stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        deadline = time.time() + 30
        while time.time() < deadline:
            try:
                self.call("GET", "/api/server-version")
                return
            except (urllib.error.URLError, ConnectionError):
                if self.proc.poll() is not None:
                    raise RuntimeError("隔離サーバーが起動しません: " + self.proc.stderr.read().decode("utf-8", "replace")[-800:])
                time.sleep(0.3)
        raise RuntimeError("隔離サーバーが30秒以内に応答しません")

    def call(self, method, path, body=None, expect=(200,)):
        data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(self.base + path, data=data, method=method,
                                     headers={"Content-Type": "application/json"} if data else {})
        try:
            with urllib.request.urlopen(req, timeout=120) as res:
                status, raw = res.status, res.read()
        except urllib.error.HTTPError as exc:
            status, raw = exc.code, exc.read()
        payload = json.loads(raw.decode("utf-8")) if raw else None
        if status not in expect:
            raise RuntimeError(f"{method} {path} → HTTP {status}: {raw[:400].decode('utf-8', 'replace')}")
        return payload

    def stop(self):
        self.proc.terminate()
        try:
            self.proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.proc.kill()


# ---- 状態の読み取り（R2/R3/R4 用） -------------------------------------------------------------
def state_of(server, pid):
    scene = server.call("GET", f"/api/studio/v05/scene/instances?id={pid}")
    arr = server.call("GET", f"/api/studio/v05/arrangement?id={pid}")
    fps = server.call("GET", f"/api/studio/v05/project/fps?id={pid}")
    ph = server.call("GET", f"/api/studio/v05/playhead?id={pid}")
    return {"scene": scene, "arrangement": arr, "fps": fps, "playhead": ph}


def export_current(work, pid, record, files_by_id):
    """設計 §5.6 の current（collect の target と同じ形＋playhead）を一時データから作り、逆変換する。"""
    import studio_v05_legacy_import as L
    roots = L._Roots(work)
    row = L._project_row(roots, pid)
    scene = L._read_scene(roots, pid)
    arr = __import__("studio_v05_arrangement").read(roots.arr, roots.catalog, pid)
    ph = __import__("studio_v05_playhead").read(roots.playhead, roots.catalog, pid)
    current = {
        "fps": {"presence": "value", "value": row["fps"]} if "fps" in row else {"presence": "absent"},
        "scene": {"revision": scene["revision"], "instances": scene["instances"], "camera": scene["camera"],
                  "face_keys": scene["face_keys"]},
        "scene_model": {"model": None},
        "arrangement": {"revision": arr["revision"], "clips": arr["clips"]},
        "playhead": {"seconds": ph["seconds"]},
        "asset_sha256": {aid: (sha256(p) if p and Path(p).is_file() else None) for aid, p in files_by_id.items()},
    }
    return L._export_legacy_for_test(record, current)


def files_for_ids(work, ids):
    import studio_v05_legacy_import as L  # noqa: F401 （import 経路の確認）
    library = read_json(work / "library_assets" / "index.json")["items"] if (work / "library_assets" / "index.json").exists() else []
    out = {}
    for aid in ids:
        if aid.startswith("library:"):
            item = next((i for i in library if i.get("id") == aid), None)
            out[aid] = str(work / "library_assets" / "files" / item["filename"]) if item else None
        elif aid.startswith("integrated:"):
            out[aid] = str(work / "integrated_v02" / "assets" / aid[len("integrated:"):])
        elif aid.startswith("fbx:"):
            out[aid] = str(work / "files" / (aid[len("fbx:"):] + ".fbx"))
        elif aid.startswith("mmd:"):
            slot, name = aid.split(":", 2)[1:]
            out[aid] = str(work / "mmd" / slot / name)
    return out


# ---- 本体 ------------------------------------------------------------------------------------
def run(args):
    data = Path(args.data).resolve()
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    if not (data / "project_state.json").is_file():
        raise SystemExit(f"--data に旧保存（project_state.json）がありません: {data}")
    report = {"data": str(data), "started_at": time.strftime("%Y-%m-%d %H:%M:%S"), "checks": {}, "unverified": [], "notes": []}

    # 1. 元の SHA-256 を取ってから、読み取りだけで一時フォルダへ複製する
    assets_rel, asset_ids = referenced_files(data)
    sources = [r for r in LEGACY_FILES + INDEX_FILES if (data / r).is_file()] + assets_rel
    before = {r: sha256(data / r) for r in sources}
    report["sources"] = {"files": len(sources), "referenced_asset_ids": asset_ids, "asset_files": assets_rel,
                         "bytes": sum((data / r).stat().st_size for r in sources)}
    tmp_parent = Path(tempfile.mkdtemp(prefix="bai-legacy-real-"))
    work = tmp_parent / "data"
    try:
        for r in sources:
            target = work / r
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(data / r, target)
        copied = {r: sha256(work / r) for r in sources}
        report["checks"]["copy_identical"] = copied == before

        # 2. 隔離サーバー
        server = Server(work, args.port or free_port())
        try:
            # 3. 作品・スナップショット・確認
            pid = server.call("POST", "/api/studio/v05/projects", {"name": PROJECT_NAME, "kind": "empty"})["project"]["id"]
            server.call("POST", "/api/studio/v05/project/snapshot", {"id": pid})
            pre = state_of(server, pid)
            legacy_tmp = {r: sha256(work / r) for r in LEGACY_FILES if (work / r).is_file()}
            snap_path = work / "studio_v05_snapshots" / f"{pid}.json"
            snap_sha = sha256(snap_path)
            preview = server.call("GET", f"/api/studio/v05/project/legacy-import-preview?id={pid}&include=music_dance,timeline_editor")
            report["preview"] = {k: preview.get(k) for k in ("ok", "reject", "summary", "source_info")}
            report["preview_items"] = preview.get("items", [])
            if not preview.get("ok"):
                raise RuntimeError("確認が拒否されました: " + json.dumps(preview.get("reject"), ensure_ascii=False))

            # 4. 適用：画面（③の取込ダイアログ）から。ブラウザーが無ければ HTTP で
            ui = None
            chromium = args.chromium or os.environ.get("CHROMIUM_PATH")
            node = shutil.which("node")
            if chromium and node and not args.no_browser:
                config = {"base": server.base, "projectId": pid, "projectName": PROJECT_NAME, "out": str(out),
                          "chromium": chromium, "realGpu": not args.swiftshader}
                proc = subprocess.run([node, str(ROOT / "tools" / "legacy_import_real_check_ui.cjs"), json.dumps(config, ensure_ascii=False)],
                                      cwd=str(ROOT), capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=900)
                if proc.returncode:
                    raise RuntimeError("画面での取込に失敗: " + (proc.stderr or proc.stdout)[-1500:])
                ui = json.loads(proc.stdout.strip().splitlines()[-1])
                report["ui"] = ui
            else:
                report["unverified"].append("画面（③の取込ダイアログ）と画像：CHROMIUM_PATH または Node.js が無いため HTTP で適用した")
                server.call("POST", "/api/studio/v05/project/legacy-import/apply",
                            {"id": pid, "expected": preview["expected"], "include": ["music_dance", "timeline_editor"],
                             "fps_policy": "keep_if_same", "confirm": True})
            record = server.call("GET", f"/api/studio/v05/project/legacy-import?id={pid}")["record"]
            post = state_of(server, pid)
            report["applied"] = {
                "state": record and record.get("state"),
                "instances": [{"asset_id": i["asset_id"], "transform": i["transform"]} for i in post["scene"]["instances"]],
                "clips": [{k: c.get(k) for k in ("track", "asset_id", "name", "start", "duration", "source_start")} for c in post["arrangement"]["clips"]],
                "fps": post["fps"],
                "summary": record and record.get("summary"),
            }

            # 5. R2：編集せずに逆変換すると元の bundle と等しい
            from project_state_bundle import validate_bundle
            files_by_id = files_for_ids(work, asset_ids)
            r2 = export_current(work, pid, record, files_by_id)
            expected_bundle = validate_bundle(copy.deepcopy(record["source"]["bundle"]))
            report["checks"]["R2"] = {"pass": r2["bundle"] == expected_bundle and not r2["changed"] and not r2["unrepresentable"],
                                      "changed": r2["changed"], "unrepresentable": r2["unrepresentable"],
                                      "asset_hash_changed": r2.get("asset_hash_changed")}

            # 6. R4：ステージを動かすと、その変更だけが旧形式へ反映される
            stage_step = next((s for s in record["steps"] if s["kind"] == "scene_add" and s.get("role") == "stage" and s.get("instance_id")), None)
            if stage_step:
                scene_now = post["scene"]
                inst = next(i for i in scene_now["instances"] if i["id"] == stage_step["instance_id"])
                moved = copy.deepcopy(inst["transform"])
                moved["position"] = [round(moved["position"][0] + 1.25, 6), moved["position"][1], round(moved["position"][2] - 0.5, 6)]
                server.call("POST", "/api/studio/v05/scene/instances",
                            {"project_id": pid, "action": "update", "revision": scene_now["revision"],
                             "instance_id": inst["id"], "transform": moved})
                r4 = export_current(work, pid, record, files_by_id)
                got = (r4["bundle"].get("workspace") or {}).get("stage", {}).get("position")
                report["checks"]["R4"] = {"pass": got == moved["position"] and r4["changed"] == ["/workspace/stage/position"] and not r4["unrepresentable"],
                                          "expected_position": moved["position"], "exported_position": got,
                                          "changed": r4["changed"], "unrepresentable": r4["unrepresentable"]}
            else:
                report["checks"]["R4"] = {"pass": None, "reason": "旧保存にステージが無いため、ステージの移動で確かめられない"}
                report["unverified"].append("R4（編集後の逆変換）：旧保存にステージが無い")

            # 7. 再生位置を3回動かしてから取消（R3）
            for seconds in (1.0, 2.5, 4.0):
                ph = server.call("GET", f"/api/studio/v05/playhead?id={pid}")
                server.call("POST", "/api/studio/v05/playhead", {"project_id": pid, "seconds": seconds, "revision": ph["revision"]})
            before_revert = state_of(server, pid)
            server.call("POST", "/api/studio/v05/project/legacy-import/revert", {"id": pid, "confirm": True})
            after = state_of(server, pid)
            same = lambda a, b, key: a["scene"].get(key) == b["scene"].get(key)  # noqa: E731
            r3 = {
                "instances": same(pre, after, "instances"), "face_keys": same(pre, after, "face_keys"),
                "camera": same(pre, after, "camera"),
                "clips": pre["arrangement"]["clips"] == after["arrangement"]["clips"],
                "scene_revision_grew": after["scene"]["revision"] > before_revert["scene"]["revision"],
                "arrangement_revision_grew": after["arrangement"]["revision"] > post["arrangement"]["revision"],
                "fps_same": pre["fps"] == after["fps"],
                "playhead_kept": after["playhead"]["seconds"] == before_revert["playhead"]["seconds"],
            }
            r3["pass"] = all(r3.values())
            report["checks"]["R3"] = r3
            report["checks"]["temp_legacy_and_snapshot_unchanged"] = (
                {r: sha256(work / r) for r in legacy_tmp} == legacy_tmp and sha256(snap_path) == snap_sha)
        finally:
            server.stop()
    finally:
        # 8. R1：元の data は前後で同じ
        after_hash = {r: sha256(data / r) for r in sources}
        changed = [r for r in sources if after_hash.get(r) != before.get(r)]
        report["checks"]["R1"] = {"pass": not changed and report["checks"].get("temp_legacy_and_snapshot_unchanged", False),
                                  "original_files": len(sources), "changed": changed,
                                  "temp_legacy_and_snapshot_unchanged": report["checks"].get("temp_legacy_and_snapshot_unchanged")}
        shutil.rmtree(tmp_parent, ignore_errors=True)
    report["finished_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    passed = all(report["checks"].get(k, {}).get("pass") for k in ("R1", "R2", "R3")) and report["checks"].get("R4", {}).get("pass") is not False
    report["pass"] = bool(passed)
    (out / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    (out / "report_JA.md").write_text(render_ja(report), encoding="utf-8")
    return report


def mark(value):
    return "合格" if value is True else "不合格" if value is False else "判定なし"


def render_ja(r):
    c = r["checks"]
    lines = [f"# 旧保存→v0.5取込 実データ確認（{r['finished_at']}）", "",
             f"総合：**{mark(r['pass'])}**", "",
             "| 判定 | 結果 | 内容 |", "|---|---|---|",
             f"| R1 元を壊さない | {mark(c.get('R1', {}).get('pass'))} | 元の {c.get('R1', {}).get('original_files')} ファイルの SHA-256 が前後で一致。変わったもの：{c.get('R1', {}).get('changed') or 'なし'}。一時領域の旧保存とスナップショットも不変：{mark(c.get('R1', {}).get('temp_legacy_and_snapshot_unchanged'))} |",
             f"| R2 往復一致 | {mark(c.get('R2', {}).get('pass'))} | 取込直後の逆変換が元の bundle と一致。changed：{c.get('R2', {}).get('changed')}、unrepresentable：{c.get('R2', {}).get('unrepresentable')} |",
             f"| R3 取消 | {mark(c.get('R3', {}).get('pass'))} | {', '.join(f'{k}={v}' for k, v in c.get('R3', {}).items() if k != 'pass')} |",
             f"| R4 編集後の逆変換 | {mark(c.get('R4', {}).get('pass'))} | ステージを動かした値：{c.get('R4', {}).get('expected_position')}、逆変換：{c.get('R4', {}).get('exported_position')}、changed：{c.get('R4', {}).get('changed')} |",
             "", "## 取込元", "",
             f"- 複製したファイル：{r['sources']['files']} 件（{r['sources']['bytes'] / 1048576:.1f} MiB）。複製の hash は元と一致：{mark(c.get('copy_identical'))}",
             f"- 参照している素材ID：{', '.join(r['sources']['referenced_asset_ids'])}",
             "", "## 確認（取込前）", ""]
    summary = (r.get("preview") or {}).get("summary") or {}
    lines += [f"- 写るもの：{'、'.join(summary.get('mapped', []))}", f"- 写らないもの（取込記録に残る）：{'、'.join(summary.get('kept', []))}",
              f"- 写す {summary.get('mapped_count')} 件、保管 {summary.get('kept_count')} 件、注意 {summary.get('warnings')} 件", "",
              "| 項目 | 結果 | 理由 |", "|---|---|---|"]
    for item in r.get("preview_items", []):
        lines.append(f"| {item.get('label', item.get('pointer'))} | {item.get('status')} | {' '.join(item.get('messages') or [])} |")
    applied = r.get("applied") or {}
    lines += ["", "## 取込の結果", "", f"- 取込記録の状態：{applied.get('state')}", f"- 作品FPS：{applied.get('fps')}", "",
              "| 3D場面の素材 | 位置 | 回転 | 拡大 |", "|---|---|---|---|"]
    for inst in applied.get("instances", []):
        t = inst["transform"]
        lines.append(f"| {inst['asset_id']} | {t['position']} | {t['rotation']} | {t['scale']} |")
    lines += ["", "| トラック | 素材 | 開始（秒） | 長さ（秒） | 元区間の開始（秒） |", "|---|---|---|---|---|"]
    for clip in applied.get("clips", []):
        lines.append(f"| {clip['track']} | {clip.get('name') or clip['asset_id']} | {clip['start']} | {clip['duration']} | {clip.get('source_start')} |")
    ui = r.get("ui")
    lines += ["", "## 画面と画像", ""]
    if ui:
        lines += [f"- 描画器：{ui.get('renderer')}", f"- 取込の結果の行：{ui.get('status')}",
                  f"- タイムラインのクリップ数（画面／API）：{ui.get('timelineClips')}／{len(applied.get('clips', []))}",
                  f"- 3D場面の読込数：{ui.get('sceneLoaded')}",
                  f"- 3D場面の動作：読込 {ui.get('motionLoaded')} 件／計画で ready {ui.get('planReady')} 件（待ちの結果：{ui.get('motionWait')}、理由：{ui.get('motionIssues') or 'なし'}）",
                  f"- 画面のエラー：{ui.get('pageErrors') or 'なし'}",
                  *[f"- 読込後の外接箱 {b['asset_id']}：大きさ {[round(v, 3) for v in b['size']] if b.get('size') else '不明'}、最小 {[round(v, 3) for v in b['min']] if b.get('min') else '不明'}、最大 {[round(v, 3) for v in b['max']] if b.get('max') else '不明'}"
                    for b in ui.get('bounds', [])],
                  f"- 画像：{', '.join(ui.get('shots', []))}"]
    lines += ["", "## 未検証", ""] + [f"- {u}" for u in r["unverified"]] + [
        "- 見た目の大きさの一致（WP-L8a）。旧画面と v0.5 では、モデルの正規化の仕方が違う",
        "- カメラの動き（WP-L8b）。v0.5 に時刻付きカメラの保存先が無いため保管だけ",
        "- 見た目の判定は、開発側が画像を見て docs/v05 の証拠文書に記録する"]
    return "\n".join(lines) + "\n"


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--data", required=True, help="所有者の data フォルダ（読み取りだけ）")
    ap.add_argument("--out", required=True, help="報告と画像の保存先")
    ap.add_argument("--port", type=int, default=0)
    ap.add_argument("--chromium", default=None, help="Chrome/Chromium の実行ファイル（省略時は CHROMIUM_PATH）")
    ap.add_argument("--swiftshader", action="store_true", help="実GPUではなく SwiftShader で描く")
    ap.add_argument("--no-browser", action="store_true", help="画面を使わず HTTP で適用する")
    report = run(ap.parse_args())
    print(json.dumps({"pass": report["pass"], "R1": report["checks"]["R1"]["pass"], "R2": report["checks"].get("R2", {}).get("pass"),
                      "R3": report["checks"].get("R3", {}).get("pass"), "R4": report["checks"].get("R4", {}).get("pass")}, ensure_ascii=False))
    sys.exit(0 if report["pass"] else 1)


if __name__ == "__main__":
    main()
