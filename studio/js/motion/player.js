// @ts-check
// ⑤ 1体のモデルに1つのモーションを当てる（P2 設計 §2.5(c)、WP-05a）。DOM を使わない。rAF は呼び出し側が回す。
// GLB/VRM のクリップは AnimationMixer、PMX の VMD は MMDAnimationHelper で IK・grant も評価する。

/**
 * @typedef {{kind: 'vmd'|'clip', id: string, clipIndex: number|null, duration: number}} MotionInfo
 * @typedef {{format: string|null, motion: MotionInfo|null, playing: boolean, time: number}} PlayerState
 */

/** 末尾（ちょうど duration）に置くと LoopRepeat が 0 に戻るので、位置の指定はこの分だけ手前で止める。 */
const END_EPS = 1e-7;

/** @param {any} THREE @param {any} MMDAnimationHelper */
export function createPlayer(THREE, MMDAnimationHelper) {
  /** @type {any} */ let object = null;
  /** @type {string|null} */ let format = null;
  /** @type {any[]} */ let animations = [];
  /** @type {any} */ let mixer = null;
  /** @type {any} */ let action = null;
  /** @type {any} */ let mmdHelper = null;
  /** @type {MotionInfo|null} */ let motion = null;
  let playing = false;
  /** @type {((mesh: any, seconds: number) => void)|null} */ let pmxPoseModifier = null;

  /** シーク先のキーを評価し、同じ時刻で PMX の IK・grant まで解く。 @param {number} t */
  function evaluateMmdTime(t) {
    // 表示中の IK・grant 適用後姿勢を、前回保存した素の VMD 姿勢へ戻す。
    mmdHelper._restoreBones(object);
    // mixer の変更検知バッファを現在姿勢に合わせる。往復シークで同じキー値へ戻る時も骨へ反映する。
    mmdHelper._updatePropertyMixersBuffer(object);
    mixer.setTime(t);
    // A modifier is evaluated after the raw VMD and before PMX IK/grant.
    // Keep the original helper path untouched unless a caller explicitly opts in.
    if (pmxPoseModifier) {
      const state = mmdHelper.objects.get(object);
      if (String(THREE.REVISION) !== '160' || !state || state.mixer !== mixer ||
          typeof mmdHelper._animatePMXMesh !== 'function' ||
          typeof mmdHelper._sortBoneDataArray !== 'function' ||
          object.geometry?.userData?.MMD?.format !== 'pmx')
        throw new Error('PMX 補正の評価器はこの Three.js 版に対応していません');
      pmxPoseModifier(object, t);
      mmdHelper._saveBones(object);
      if (!state.sortedBonesData)
        state.sortedBonesData = mmdHelper._sortBoneDataArray(object.geometry.userData.MMD.bones.slice());
      mmdHelper._animatePMXMesh(object, state.sortedBonesData,
        mmdHelper.enabled.ik ? state.ikSolver : null,
        mmdHelper.enabled.grant ? state.grantSolver : null);
    } else {
      // helper.update restores the saved raw pose, then resolves IK and grant.
      mmdHelper._saveBones(object);
      mmdHelper.update(0);
    }
  }

  function stopActions() {
    if (mixer) mixer.stopAllAction();
    action = null;
    motion = null;
    playing = false;
  }

  /** @param {any} clip @param {MotionInfo} info */
  function start(clip, info) {
    if (!mixer) throw new Error('モデルがありません');
    if (info.kind === 'vmd' && format === 'PMX') {
      if (!MMDAnimationHelper || !object?.isSkinnedMesh) throw new Error('PMX の IK 再生を初期化できません');
      // PMX の足 IK は目標骨のキーだけでは脚へ伝わらない。物理は使わず、IK と grant を評価する。
      mixer.stopAllAction();
      mixer.uncacheRoot(object);
      mmdHelper?.remove(object);
      mmdHelper = null;
      const nextHelper = new MMDAnimationHelper({ sync: false, pmxAnimation: true });
      nextHelper.add(object, { animation: clip, physics: false });
      const nextMixer = nextHelper.objects.get(object)?.mixer;
      if (!nextMixer) { nextHelper.remove(object); throw new Error('PMX のアニメーションを初期化できません'); }
      mmdHelper = nextHelper;
      mixer = nextMixer;
      action = mixer.clipAction(clip);
      action.reset().play();
      evaluateMmdTime(0);
      motion = info;
      return;
    }
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
      if (mmdHelper && object) mmdHelper.remove(object);
      mmdHelper = null;
      if (mixer && object) { try { mixer.uncacheRoot(object); } catch { /* 既に無い */ } }
      mixer = null; object = null; format = null; animations = []; pmxPoseModifier = null;
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
    /** PMX only. null restores the existing evaluation path. */
    setPmxPoseModifier(fn) {
      if (fn !== null && typeof fn !== 'function') throw new TypeError('PMX modifier must be a function or null');
      if (fn && (!mmdHelper || format !== 'PMX')) throw new Error('PMX VMD がありません');
      pmxPoseModifier = fn;
    },
    /** 0〜duration に丸めて姿勢を当てる（index.html:162 の mixer.setTime）。 @param {number} sec */
    seek(sec) {
      if (!mixer || !motion) return;
      const t = Math.min(Math.max(0, Number.isFinite(sec) ? sec : 0), Math.max(0, motion.duration - END_EPS));
      if (mmdHelper) evaluateMmdTime(t);
      else mixer.setTime(t);
    },
    /** 再生中だけ進める（ループは three の既定 LoopRepeat。旧と同じ）。 @param {number} dt */
    update(dt) { if (playing && mixer) {
      if (mmdHelper && pmxPoseModifier) {
        const duration = Math.max(END_EPS, motion?.duration || 0);
        const next = ((action?.time || 0) + dt) % duration;
        evaluateMmdTime(next < 0 ? next + duration : next);
      }
      else if (mmdHelper) mmdHelper.update(dt); else mixer.update(dt);
    } },
    /** @returns {PlayerState} */
    state() { return { format, motion, playing, time: action ? action.time : 0 }; },
    /** テスト用の読み取りだけ。無い名前は null。 @param {{bones?: string[], rotations?: string[], morphs?: string[]}} q */
    probe(q) {
      /** @type {{bones: Record<string, number[]|null>, rotations: Record<string, number[]|null>, morphs: Record<string, number|null>}} */
      const out = { bones: {}, rotations: {}, morphs: {} };
      if (!object) return out;
      /** @param {string} name */
      const findBone = (name) => {
        let b = object.getObjectByName(name);
        if (!b) {
          object.traverse((/** @type {any} */ o) => { if (!b && o.isSkinnedMesh && o.skeleton) b = o.skeleton.getBoneByName(name); });
        }
        return b;
      };
      for (const name of q.bones || []) {
        const b = findBone(name);
        out.bones[name] = b ? b.position.toArray() : null;
      }
      for (const name of q.rotations || []) {
        const b = findBone(name);
        out.rotations[name] = b ? [b.rotation.x, b.rotation.y, b.rotation.z] : null;
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
