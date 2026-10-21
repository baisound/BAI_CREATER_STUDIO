// @ts-check
// ⑤ 1体のモデルに1つのモーションを当てる（P2 設計 §2.5(c)、WP-05a）。DOM を使わない。rAF は呼び出し側が回す。
// GLB/VRM のクリップは index.html:207、PMX への VMD は index.html:345 と同じ（mixer.clipAction(...).reset().play()）。

/**
 * @typedef {{kind: 'vmd'|'clip', id: string, clipIndex: number|null, duration: number}} MotionInfo
 * @typedef {{format: string|null, motion: MotionInfo|null, playing: boolean, time: number}} PlayerState
 */

/** 末尾（ちょうど duration）に置くと LoopRepeat が 0 に戻るので、位置の指定はこの分だけ手前で止める。 */
const END_EPS = 1e-7;

/** @param {any} THREE */
export function createPlayer(THREE) {
  /** @type {any} */ let object = null;
  /** @type {string|null} */ let format = null;
  /** @type {any[]} */ let animations = [];
  /** @type {any} */ let mixer = null;
  /** @type {any} */ let action = null;
  /** @type {MotionInfo|null} */ let motion = null;
  let playing = false;

  function stopActions() {
    if (mixer) mixer.stopAllAction();
    action = null;
    motion = null;
    playing = false;
  }

  /** @param {any} clip @param {MotionInfo} info */
  function start(clip, info) {
    if (!mixer) throw new Error('モデルがありません');
    if (action) action.stop();
    mixer.stopAllAction();
    action = mixer.clipAction(clip);
    action.reset().play();
    mixer.setTime(0); // 最初の姿勢を当てる
    motion = info;
  }

  const api = {
    /** 前のモデルの mixer は止めて捨てる。モーションは null、playing=false、time=0。 @param {any} obj @param {string} fmt @param {any[]} [anims] */
    setModel(obj, fmt, anims = []) {
      api.clearModel();
      object = obj; format = fmt; animations = anims || [];
      mixer = new THREE.AnimationMixer(obj);
    },
    clearModel() {
      stopActions();
      if (mixer && object) { try { mixer.uncacheRoot(object); } catch { /* 既に無い */ } }
      mixer = null; object = null; format = null; animations = [];
    },
    /** @param {number} index */
    applyClip(index) {
      const clip = animations[index];
      if (!clip) throw new Error('クリップがありません');
      start(clip, { kind: 'clip', id: String(index), clipIndex: index, duration: clip.duration });
    },
    /** @param {any} clip @param {string} id */
    applyVmd(clip, id) { start(clip, { kind: 'vmd', id, clipIndex: null, duration: clip.duration }); },
    play() { if (motion) playing = true; },
    /** 位置を保つ（index.html:213「現在位置を保持」）。 */
    pause() { playing = false; },
    /** 0〜duration に丸めて姿勢を当てる（index.html:162 の mixer.setTime）。 @param {number} sec */
    seek(sec) {
      if (!mixer || !motion) return;
      const t = Math.min(Math.max(0, Number.isFinite(sec) ? sec : 0), Math.max(0, motion.duration - END_EPS));
      mixer.setTime(t);
    },
    /** 再生中だけ進める（ループは three の既定 LoopRepeat。旧と同じ）。 @param {number} dt */
    update(dt) { if (playing && mixer) mixer.update(dt); },
    /** @returns {PlayerState} */
    state() { return { format, motion, playing, time: action ? action.time : 0 }; },
    /** テスト用の読み取りだけ。無い名前は null。 @param {{bones?: string[], morphs?: string[]}} q */
    probe(q) {
      /** @type {{bones: Record<string, number[]|null>, morphs: Record<string, number|null>}} */
      const out = { bones: {}, morphs: {} };
      if (!object) return out;
      for (const name of q.bones || []) {
        let b = object.getObjectByName(name);
        if (!b) {
          object.traverse((/** @type {any} */ o) => { if (!b && o.isSkinnedMesh && o.skeleton) b = o.skeleton.getBoneByName(name); });
        }
        out.bones[name] = b ? b.position.toArray() : null;
      }
      /** @type {any} */ let mesh = null;
      if ((q.morphs || []).length) object.traverse((/** @type {any} */ o) => { if (!mesh && o.morphTargetDictionary && o.morphTargetInfluences) mesh = o; });
      for (const name of q.morphs || []) {
        const i = mesh ? mesh.morphTargetDictionary[name] : undefined;
        out.morphs[name] = i === undefined ? null : mesh.morphTargetInfluences[i];
      }
      return out;
    },
    dispose() { api.clearModel(); },
  };
  return api;
}
