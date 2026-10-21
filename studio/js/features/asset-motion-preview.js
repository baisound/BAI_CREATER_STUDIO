// @ts-check
// SCR-08 の読み取り専用モーション見本。原本・ウェイト・制作状態へ書き込まない。
import { loadLibs, loadModel, loadErrorText, disposeObject } from '../viewport/model-loader.js';
import { normalizeModel } from '../viewport/normalize.fork.js';
import { createViewport } from '../viewport/three-host.js';
import { createPlayer } from '../motion/player.js';
import { loadVmdClip, vmdUrl } from '../motion/vmd.js';
import { createGrayman } from './asset-grayman.js';

/** @typedef {import('./assets-model.js').AssetItem} AssetItem */

/** @param {AssetItem} item @param {AssetItem[]} items */
export function previewModels(item, items) {
  if (item.format !== 'VMD') return [];
  return items.filter((a) => a.available && a.format === 'PMX').sort((a, b) => (a.kind === 'A' ? -1 : a.kind === 'B' ? 1 : 0) - (b.kind === 'A' ? -1 : b.kind === 'B' ? 1 : 0));
}

/** 統合GLBは1ファイルに複数クリップがあるため、一覧で選んだ動きの名前を優先する。 @param {AssetItem} item @param {any[]} clips */
function preferredClip(item, clips) {
  if (clips.length < 2) return 0;
  const key = String(item.name.split('/').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const exact = clips.findIndex((clip) => String(clip.name || '').toLowerCase().replace(/[^a-z0-9]/g, '') === key);
  if (key && exact >= 0) return exact;
  const contains = clips.findIndex((clip) => String(clip.name || '').toLowerCase().replace(/[^a-z0-9]/g, '').includes(key));
  if (key && contains >= 0) return contains;
  const moving = clips.findIndex((clip) => !/t.?pose|bind.?pose|reference/i.test(String(clip.name || '')));
  return moving >= 0 ? moving : 0;
}

/** @param {AssetItem} item @param {AssetItem|null} model @param {import('../viewport/model-loader.js').Libs} libs */
async function loadMotion(item, model, libs) {
  const source = item.format === 'VMD' ? model : item;
  if (!source) throw new Error('VMD の見本には PMX モデルが必要です。素材管理に PMX を登録してください。');
  const result = await loadModel(source, libs);
  try {
    normalizeModel(result.object, result.format, libs.THREE);
    const clips = item.format === 'VMD' ? [await loadVmdClip(libs, vmdUrl(item), result.object)] : result.animations;
    return { ...result, clips };
  } catch (error) {
    disposeObject(result.object);
    throw error;
  }
}

/** 現在表示しているグレーマンまたは元形状を見本カメラへ収める。 @param {any} host @param {any} THREE @param {any} object */
function fitMovingPose(host, THREE, object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object, true);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(0.5, box.getSize(new THREE.Vector3()).length() / 2);
  const vfov = host.camera.fov * Math.PI / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * host.camera.aspect);
  const distance = radius / Math.sin(Math.min(vfov, hfov) / 2) * 1.12;
  host.camera.position.copy(center).add(new THREE.Vector3(0.35, 0.24, 1).normalize().multiplyScalar(distance));
  host.camera.near = Math.max(0.01, radius / 200);
  host.camera.far = Math.max(500, radius * 40 + distance * 2);
  host.camera.updateProjectionMatrix();
  host.controls.target.copy(center);
  host.controls.update(); host.invalidate();
}

/** 平行移動する動きでも見本の中心を保つ。ズームと視点角度は変えない。 @param {any} host @param {any} THREE @param {any} object */
function followMovingPose(host, THREE, object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object, true);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const shift = center.sub(host.controls.target);
  host.camera.position.add(shift);
  host.controls.target.add(shift);
  host.controls.update();
}

/**
 * 見本画像：同じカメラで開始・中間・終了の骨格姿勢を並べる。画面内のカードだけ遅延生成する。
 * @param {AssetItem} item @param {AssetItem|null} model
 * @returns {Promise<string>} PNG data URL
 */
export async function motionThumbnail(item, model = null) {
  const libs = await loadLibs();
  const loaded = await loadMotion(item, model, libs);
  const { THREE } = libs;
  const player = createPlayer(THREE, libs.MMDAnimationHelper);
  try {
    const selected = preferredClip(item, loaded.clips);
    const clip = loaded.clips[selected];
    if (!clip) throw new Error('動きが含まれていません');
    player.setModel(loaded.object, loaded.format, loaded.clips);
    if (item.format === 'VMD') player.applyVmd(clip, item.id);
    else player.applyClip(selected);
    const bones = /** @type {any[]} */ ([]);
    const bodyName = /head|neck|spine|chest|pelvis|hips|shoulder|arm|forearm|hand|thigh|leg|calf|foot|ankle|toe|上半身|下半身|首|頭|肩|腕|ひじ|手首|足|ひざ/i;
    const extraName = /hair|髪|物理|skirt|スカート|袖|finger|thumb|index|middle|ring|pinky|親指|人指|中指|薬指|小指|目|眉|口|ＩＫ|IK|D$/i;
    loaded.object.traverse((/** @type {any} */ node) => { if (node.isBone && bodyName.test(node.name) && !extraName.test(node.name)) bones.push(node); });
    const samples = [0.08, 0.5, 0.92].map((part) => {
      player.seek(Math.max(0, clip.duration * part));
      loaded.object.updateMatrixWorld(true);
      const boneLines = bones.flatMap((bone) => {
        if (!bone.parent?.isBone) return [];
        const a = bone.parent.getWorldPosition(new THREE.Vector3());
        const b = bone.getWorldPosition(new THREE.Vector3());
        return [[a.x + a.z * 0.18, a.y, b.x + b.z * 0.18, b.y]];
      });
      if (boneLines.length) return boneLines;
      // 骨を含まない短いGLB/FBXも、移動するメッシュの輪郭から見本を作る。
      const outlines = /** @type {number[][]} */ ([]);
      loaded.object.traverse((/** @type {any} */ node) => {
        if (!node.isMesh) return;
        const box = new THREE.Box3().setFromObject(node);
        if (box.isEmpty()) return;
        const x0 = box.min.x + box.min.z * 0.18, x1 = box.max.x + box.max.z * 0.18;
        const y0 = box.min.y, y1 = box.max.y;
        outlines.push([x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]);
      });
      return outlines;
    });
    if (!samples.some((segments) => segments.length)) throw new Error('見本画像に使う姿勢がありません');
    const canvas = document.createElement('canvas');
    canvas.width = 360; canvas.height = 270;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('見本画像を描画できません');
    g.fillStyle = '#172638'; g.fillRect(0, 0, 360, 270);
    const labels = ['開始', '中間', '終了'];
    samples.forEach((segments, i) => {
      const x0 = i * 120;
      if (i) { g.fillStyle = '#43566e'; g.fillRect(x0, 0, 1, 270); }
      const xs = segments.flatMap((s) => [s[0], s[2]]), ys = segments.flatMap((s) => [s[1], s[3]]);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      const scale = Math.min(94 / Math.max(maxX - minX, 0.01), 200 / Math.max(maxY - minY, 0.01));
      const px = (/** @type {number} */ x) => x0 + 60 + (x - (minX + maxX) / 2) * scale;
      const py = (/** @type {number} */ y) => 244 - (y - minY) * scale;
      g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 2.5; g.strokeStyle = '#c5e7f3';
      for (const s of segments) {
        g.beginPath(); g.moveTo(px(s[0]), py(s[1])); g.lineTo(px(s[2]), py(s[3])); g.stroke();
      }
      g.font = '14px sans-serif'; g.fillStyle = '#ffcf74'; g.fillText(labels[i], x0 + 8, 22);
    });
    return canvas.toDataURL('image/png');
  } finally {
    player.dispose();
    disposeObject(loaded.object);
  }
}

/**
 * 詳細欄の3D再生。画面を離れたり別素材を選ぶと呼び出し元が dispose する。
 * @param {HTMLElement} stage @param {AssetItem} item @param {AssetItem[]} items
 * @param {{play: HTMLButtonElement, pause: HTMLButtonElement, fit: HTMLButtonElement, seek: HTMLInputElement, time: HTMLElement, status: HTMLElement, clip: HTMLSelectElement, model: HTMLSelectElement}} ui
 */
export function mountMotionPreview(stage, item, items, ui) {
  /** @type {ReturnType<typeof createViewport>|null} */ let host = null;
  /** @type {ReturnType<typeof createPlayer>|null} */ let player = null;
  /** @type {ReturnType<typeof createGrayman>|null} */ let grayman = null;
  /** @type {import('../viewport/model-loader.js').Libs|null} */ let activeLibs = null;
  let alive = true, seq = 0, raf = 0, last = 0;
  const models = previewModels(item, items);
  const say = (/** @type {string} */ message, /** @type {boolean} */ bad = false) => {
    ui.status.textContent = message;
    ui.status.dataset.kind = bad ? 'error' : 'info';
  };
  function updateUi() {
    const st = player?.state();
    const duration = st?.motion?.duration || 0;
    ui.play.disabled = !st?.motion || !!st.playing;
    ui.pause.disabled = !st?.motion || !st.playing;
    ui.seek.disabled = !st?.motion;
    ui.seek.max = String(duration || 1);
    if (document.activeElement !== ui.seek) ui.seek.value = String(Math.min(st?.time || 0, duration));
    ui.time.textContent = `${(st?.time || 0).toFixed(1)} / ${duration.toFixed(1)} 秒`;
  }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  /** @param {number} now */
  function tick(now) {
    raf = 0;
    if (!alive || !player?.state().playing) return;
    player.update(Math.min(0.1, Math.max(0, (now - last) / 1000)));
    grayman?.update();
    if (grayman && host && activeLibs) followMovingPose(host, activeLibs.THREE, grayman.object);
    last = now; host?.invalidate(); updateUi();
    raf = requestAnimationFrame(tick);
  }
  function startLoop() { if (raf || !alive) return; last = performance.now(); raf = requestAnimationFrame(tick); }
  const start = async (/** @type {AssetItem|null} */ model = null) => {
    const mine = ++seq;
    stopLoop(); player?.dispose(); player = null; host?.dispose(); host = null; activeLibs = null; grayman = null;
    delete stage.dataset.grayman;
    ui.play.disabled = ui.pause.disabled = ui.fit.disabled = ui.seek.disabled = true;
    say('動きの見本を読み込み中…');
    try {
      const libs = await loadLibs();
      if (!alive || mine !== seq) return;
      const loaded = await loadMotion(item, model, libs);
      if (!alive || mine !== seq) { disposeObject(loaded.object); return; }
      try {
        host = createViewport(stage, libs);
        host.setObject(loaded.object);
        host.fit();
        activeLibs = libs;
        player = createPlayer(libs.THREE, libs.MMDAnimationHelper);
        player.setModel(loaded.object, loaded.format, loaded.clips);
        ui.clip.replaceChildren(...loaded.clips.map((/** @type {any} */ clip, i) => new Option(`${clip.name || `動き ${i + 1}`} (${clip.duration.toFixed(1)}秒)`, String(i))));
        const selected = preferredClip(item, loaded.clips);
        ui.clip.value = String(selected);
        ui.clip.hidden = loaded.clips.length < 2;
        ui.clip.disabled = !loaded.clips.length;
        if (!loaded.clips.length) { say('この素材には再生できる動きがありません。', true); updateUi(); return; }
        if (item.format === 'VMD') player.applyVmd(loaded.clips[0], item.id);
        else player.applyClip(selected);
        grayman = createGrayman(loaded.object, libs.THREE);
        if (grayman) {
          loaded.object.traverse((/** @type {any} */ node) => { if (node.isMesh) node.visible = false; });
          host.add(grayman.object);
          grayman.update();
          stage.dataset.grayman = '1';
        } else stage.dataset.grayman = '0';
        fitMovingPose(host, libs.THREE, grayman?.object || loaded.object);
        ui.fit.disabled = false;
        player.play(); startLoop(); updateUi();
        say(grayman ? (item.format === 'VMD' ? `${model?.name || 'PMX'} の骨でグレーマンを再生中` : 'グレーマンで動きを再生中')
          : 'グレーマンに必要な骨がありません。元の形状で再生中');
      } catch (error) {
        const attached = !!host?.content.children.includes(loaded.object);
        player?.dispose(); player = null; host?.dispose(); host = null; activeLibs = null; grayman = null;
        if (!attached) disposeObject(loaded.object);
        throw error;
      }
    } catch (error) {
      if (!alive || mine !== seq) return;
      say(loadErrorText(error), true);
    }
  };
  ui.play.onclick = () => { player?.play(); startLoop(); updateUi(); say(grayman ? 'グレーマンで動きを再生中' : 'グレーマンに必要な骨がありません。元の形状で再生中'); };
  ui.pause.onclick = () => { player?.pause(); stopLoop(); updateUi(); say('一時停止中'); };
  ui.fit.onclick = () => { if (host && activeLibs) fitMovingPose(host, activeLibs.THREE, grayman?.object || host.content); };
  ui.seek.oninput = () => { player?.seek(Number(ui.seek.value)); grayman?.update(); if (grayman && host && activeLibs) followMovingPose(host, activeLibs.THREE, grayman.object); host?.invalidate(); updateUi(); };
  ui.clip.onchange = () => {
    if (!player || item.format === 'VMD') return;
    player.applyClip(Number(ui.clip.value)); grayman?.update(); if (host && activeLibs) fitMovingPose(host, activeLibs.THREE, grayman?.object || host.content); player.play(); startLoop(); updateUi();
  };
  ui.model.replaceChildren(...models.map((model) => new Option(`${model.name}（${model.kind}）`, model.id)));
  ui.model.hidden = item.format !== 'VMD';
  ui.model.disabled = !models.length;
  ui.model.onchange = () => { void start(models.find((model) => model.id === ui.model.value) || null); };
  void start(item.format === 'VMD' ? models[0] || null : null);
  return {
    dispose() {
      alive = false; seq++; stopLoop(); player?.dispose(); player = null; host?.dispose(); host = null; activeLibs = null; grayman = null;
      ui.play.onclick = ui.pause.onclick = ui.fit.onclick = ui.seek.oninput = ui.clip.onchange = ui.model.onchange = null;
    },
  };
}
