// @ts-nocheck 旧コード index.html:80・81・92・229・233・236・242 @b082ad8 のフォーク。照合テスト tests/studio-p2-motion-fork.test.mjs で一致を保証
// 82パターン表（ROWS）と、その周りの旧画面の規則（正規化・尺・実FBXの有無）。DOM は使わない（O-⑤-1）。
// 旧画面（index.html）は変えない。表を直すときは旧画面と同時に直し、照合テストで一致を確かめる。

/** 82パターン。index.html:80 の `rows`。 */
export const ROWS = [
  {"id": 1, "title": "ジャブ", "mixamo": "Boxing Leading Hand Jab", "seq": "jab", "category": "単発", "steps": ["Boxing Leading Hand Jab"]},
  {"id": 2, "title": "クロス", "mixamo": "Back Hand Cross", "seq": "cross", "category": "単発", "steps": ["Back Hand Cross"]},
  {"id": 3, "title": "左フック", "mixamo": "Boxing Lead Hand Hook", "seq": "hook", "category": "単発", "steps": ["Boxing Lead Hand Hook"]},
  {"id": 4, "title": "右フック", "mixamo": "Boxing Back Hand Hook", "seq": "hook", "category": "単発", "steps": ["Boxing Back Hand Hook"]},
  {"id": 5, "title": "アッパーカット", "mixamo": "Boxing Back Hand Uppercut", "seq": "upper", "category": "単発", "steps": ["Boxing Back Hand Uppercut"]},
  {"id": 6, "title": "クイックパンチ", "mixamo": "Quick Left Handed Punch", "seq": "jab", "category": "単発", "steps": ["Quick Left Handed Punch"]},
  {"id": 7, "title": "ボディ打ち", "mixamo": "Body Punch To The Knee", "seq": "body", "category": "単発", "steps": ["Body Punch To The Knee"]},
  {"id": 8, "title": "ボディ連打", "mixamo": "Boxing Body Jab Cross Medium", "seq": "body,cross", "category": "連続", "steps": ["Boxing Body Jab Cross Medium"]},
  {"id": 9, "title": "ワンツー", "mixamo": "Boxing Jab Cross Combo", "seq": "jab,cross", "category": "連続", "steps": ["Boxing Jab Cross Combo"]},
  {"id": 10, "title": "フック強打", "mixamo": "A Hook Punch", "seq": "hook", "category": "単発", "steps": ["A Hook Punch"]},
  {"id": 11, "title": "ストレート強打", "mixamo": "A Cross Punch", "seq": "cross", "category": "単発", "steps": ["A Cross Punch"]},
  {"id": 12, "title": "肘アッパー", "mixamo": "Illegal Elbow Uppercut", "seq": "upper", "category": "単発", "steps": ["Illegal Elbow Uppercut"]},
  {"id": 13, "title": "膝蹴り", "mixamo": "Boxing Illegal Knee", "seq": "knee", "category": "単発", "steps": ["Boxing Illegal Knee"]},
  {"id": 14, "title": "前足前蹴り", "mixamo": "Male Front Snap Kick With The Lead Foot", "seq": "frontkick", "category": "単発", "steps": ["Male Front Snap Kick With The Lead Foot"]},
  {"id": 15, "title": "後ろ足前蹴り", "mixamo": "Male Front Snap Kick With The Rear Foot Retreating", "seq": "frontkick", "category": "単発", "steps": ["Male Front Snap Kick With The Rear Foot Retreating"]},
  {"id": 16, "title": "前進回し蹴り", "mixamo": "Roundhouse Kick With Front Foot Advancing", "seq": "roundkick", "category": "単発", "steps": ["Roundhouse Kick With Front Foot Advancing"]},
  {"id": 17, "title": "後ろ足払い", "mixamo": "Back Leg Sweep", "seq": "sweep", "category": "単発", "steps": ["Back Leg Sweep"]},
  {"id": 18, "title": "頭突き", "mixamo": "Zombie Headbutt With Hand Grab", "seq": "head", "category": "単発", "steps": ["Zombie Headbutt With Hand Grab"]},
  {"id": 19, "title": "突進タックル", "mixamo": "Running To Tackle", "seq": "tackle", "category": "単発", "steps": ["Running To Tackle"]},
  {"id": 20, "title": "体勢を整える", "mixamo": "Boxing Idle", "seq": "idle", "category": "構え", "steps": ["Boxing Idle"]},
  {"id": 21, "title": "4連続ジャブ→クロス→フック→アッパー", "mixamo": "Boxing Leading Hand Jab → Back Hand Cross → Boxing Lead Hand Hook → Boxing Back Hand Uppercut", "seq": "jab,cross,hook,upper", "category": "4連続", "steps": ["Boxing Leading Hand Jab", "Back Hand Cross", "Boxing Lead Hand Hook", "Boxing Back Hand Uppercut"]},
  {"id": 22, "title": "4連続ジャブ→クロス→ボディ→アッパー", "mixamo": "Boxing Leading Hand Jab → Back Hand Cross → Body Punch To The Knee → Boxing Back Hand Uppercut", "seq": "jab,cross,body,upper", "category": "4連続", "steps": ["Boxing Leading Hand Jab", "Back Hand Cross", "Body Punch To The Knee", "Boxing Back Hand Uppercut"]},
  {"id": 23, "title": "左右フック→クロス→前蹴り", "mixamo": "Boxing Lead Hand Hook → Boxing Back Hand Hook → A Cross Punch → Male Front Snap Kick With The Lead Foot", "seq": "hook,hook,cross,frontkick", "category": "4連続", "steps": ["Boxing Lead Hand Hook", "Boxing Back Hand Hook", "A Cross Punch", "Male Front Snap Kick With The Lead Foot"]},
  {"id": 24, "title": "ボディ→ジャブ→クロス→回し蹴り", "mixamo": "Body Punch To The Knee → Boxing Leading Hand Jab → Back Hand Cross → Roundhouse Kick With Front Foot Advancing", "seq": "body,jab,cross,roundkick", "category": "4連続", "steps": ["Body Punch To The Knee", "Boxing Leading Hand Jab", "Back Hand Cross", "Roundhouse Kick With Front Foot Advancing"]},
  {"id": 25, "title": "前蹴り→ジャブ→クロス→フック", "mixamo": "Male Front Snap Kick With The Lead Foot → Boxing Leading Hand Jab → Back Hand Cross → Boxing Lead Hand Hook", "seq": "frontkick,jab,cross,hook", "category": "4連続", "steps": ["Male Front Snap Kick With The Lead Foot", "Boxing Leading Hand Jab", "Back Hand Cross", "Boxing Lead Hand Hook"]},
  {"id": 26, "title": "ジャブ→フック→膝蹴り→回し蹴り", "mixamo": "Boxing Leading Hand Jab → Boxing Back Hand Hook → Boxing Illegal Knee → Roundhouse Kick With Front Foot Advancing", "seq": "jab,hook,knee,roundkick", "category": "4連続", "steps": ["Boxing Leading Hand Jab", "Boxing Back Hand Hook", "Boxing Illegal Knee", "Roundhouse Kick With Front Foot Advancing"]},
  {"id": 27, "title": "フック→膝蹴り→アッパー", "mixamo": "Boxing Back Hand Hook → Boxing Illegal Knee → Boxing Back Hand Uppercut", "seq": "hook,knee,upper", "category": "3連続", "steps": ["Boxing Back Hand Hook", "Boxing Illegal Knee", "Boxing Back Hand Uppercut"]},
  {"id": 28, "title": "アッパー→フック→クロス", "mixamo": "Boxing Back Hand Uppercut → Boxing Lead Hand Hook → Back Hand Cross", "seq": "upper,hook,cross", "category": "3連続", "steps": ["Boxing Back Hand Uppercut", "Boxing Lead Hand Hook", "Back Hand Cross"]},
  {"id": 29, "title": "ジャブ→膝→アッパー→フック", "mixamo": "Boxing Leading Hand Jab → Boxing Illegal Knee → Boxing Back Hand Uppercut → Boxing Lead Hand Hook", "seq": "jab,knee,upper,hook", "category": "4連続", "steps": ["Boxing Leading Hand Jab", "Boxing Illegal Knee", "Boxing Back Hand Uppercut", "Boxing Lead Hand Hook"]},
  {"id": 30, "title": "タックル→ボディ→フック", "mixamo": "Running To Tackle → Body Punch To The Knee → Boxing Back Hand Hook", "seq": "tackle,body,hook", "category": "3連続", "steps": ["Running To Tackle", "Body Punch To The Knee", "Boxing Back Hand Hook"]},
  {"id": 31, "title": "ジャブを胸でガード", "mixamo": "Boxing Leading Hand Jab ＋ Blocking The Chest Area With Both Arms", "seq": "jab|block", "category": "攻防", "steps": ["Boxing Leading Hand Jab", "Blocking The Chest Area With Both Arms"]},
  {"id": 32, "title": "クロスを外側ブロック", "mixamo": "Back Hand Cross ＋ Blocking Outward", "seq": "cross|block", "category": "攻防", "steps": ["Back Hand Cross", "Blocking Outward"]},
  {"id": 33, "title": "フックを内側ブロック", "mixamo": "Boxing Back Hand Hook ＋ Blocking Inward", "seq": "hook|block", "category": "攻防", "steps": ["Boxing Back Hand Hook", "Blocking Inward"]},
  {"id": 34, "title": "ボディを防御", "mixamo": "Boxing Body Jab Cross Medium ＋ Blocking Body With Arms", "seq": "body|block", "category": "攻防", "steps": ["Boxing Body Jab Cross Medium", "Blocking Body With Arms"]},
  {"id": 35, "title": "パンチを後退回避", "mixamo": "A Cross Punch ＋ Boxing Dodge Retreat", "seq": "cross|dodge", "category": "攻防", "steps": ["A Cross Punch", "Boxing Dodge Retreat"]},
  {"id": 36, "title": "ジャブをサイドステップ", "mixamo": "Boxing Leading Hand Jab ＋ Short Left Boxing Side Step", "seq": "jab|dodge", "category": "攻防", "steps": ["Boxing Leading Hand Jab", "Short Left Boxing Side Step"]},
  {"id": 37, "title": "フックを右サイドステップ", "mixamo": "A Hook Punch ＋ Short Right Boxing Side Step", "seq": "hook|dodge", "category": "攻防", "steps": ["A Hook Punch", "Short Right Boxing Side Step"]},
  {"id": 38, "title": "アッパー被弾", "mixamo": "Boxing Back Hand Uppercut ＋ Getting Hit By An Uppercut", "seq": "upper|hit", "category": "被弾", "steps": ["Boxing Back Hand Uppercut", "Getting Hit By An Uppercut"]},
  {"id": 39, "title": "ボディ被弾", "mixamo": "Boxing Body Jab Cross Medium ＋ Receiving A Big Hit In The Stomach", "seq": "body|hit", "category": "被弾", "steps": ["Boxing Body Jab Cross Medium", "Receiving A Big Hit In The Stomach"]},
  {"id": 40, "title": "側面被弾", "mixamo": "Boxing Back Hand Hook ＋ Receiving A Big Hit In The Side", "seq": "hook|hit", "category": "被弾", "steps": ["Boxing Back Hand Hook", "Receiving A Big Hit In The Side"]},
  {"id": 41, "title": "回避→ジャブ→クロス→フック", "mixamo": "Boxing Dodge Retreat → Boxing Leading Hand Jab → Back Hand Cross → Boxing Lead Hand Hook", "seq": "dodge,jab,cross,hook", "category": "4連続", "steps": ["Boxing Dodge Retreat", "Boxing Leading Hand Jab", "Back Hand Cross", "Boxing Lead Hand Hook"]},
  {"id": 42, "title": "左ステップ→フック→アッパー", "mixamo": "Short Left Boxing Side Step → Boxing Lead Hand Hook → Boxing Back Hand Uppercut", "seq": "dodge,hook,upper", "category": "3連続", "steps": ["Short Left Boxing Side Step", "Boxing Lead Hand Hook", "Boxing Back Hand Uppercut"]},
  {"id": 43, "title": "右ステップ→アッパー→クロス", "mixamo": "Short Right Boxing Side Step → Boxing Back Hand Uppercut → Back Hand Cross", "seq": "dodge,upper,cross", "category": "3連続", "steps": ["Short Right Boxing Side Step", "Boxing Back Hand Uppercut", "Back Hand Cross"]},
  {"id": 44, "title": "ブロック→ジャブ→クロス→フック", "mixamo": "Blocking Outward → Boxing Leading Hand Jab → Back Hand Cross → Boxing Lead Hand Hook", "seq": "block,jab,cross,hook", "category": "4連続", "steps": ["Blocking Outward", "Boxing Leading Hand Jab", "Back Hand Cross", "Boxing Lead Hand Hook"]},
  {"id": 45, "title": "ボディガード→膝→フック→クロス", "mixamo": "Blocking Body With Arms → Boxing Illegal Knee → Boxing Lead Hand Hook → Back Hand Cross", "seq": "block,knee,hook,cross", "category": "4連続", "steps": ["Blocking Body With Arms", "Boxing Illegal Knee", "Boxing Lead Hand Hook", "Back Hand Cross"]},
  {"id": 46, "title": "攻撃→ノックダウン→キップアップ→反撃", "mixamo": "A Cross Punch → Knocked Down → Kip Up → Boxing Back Hand Uppercut", "seq": "cross,fall,kip,upper", "category": "起き上がり", "steps": ["A Cross Punch", "Knocked Down", "Kip Up", "Boxing Back Hand Uppercut"]},
  {"id": 47, "title": "フック被弾→ノックダウン→キップアップ→ジャブ", "mixamo": "A Hook Punch → Knocked Down → Kip Up → Boxing Leading Hand Jab", "seq": "hook,fall,kip,jab", "category": "起き上がり", "steps": ["A Hook Punch", "Knocked Down", "Kip Up", "Boxing Leading Hand Jab"]},
  {"id": 48, "title": "回し蹴り被弾→転倒→ひねり起き→クロス", "mixamo": "Roundhouse Kick With Front Foot Advancing → Knocked Down → Corkscrew Kip Up → A Cross Punch", "seq": "roundkick,fall,corkscrew,cross", "category": "起き上がり", "steps": ["Roundhouse Kick With Front Foot Advancing", "Knocked Down", "Corkscrew Kip Up", "A Cross Punch"]},
  {"id": 49, "title": "足払い→転倒→キップアップ→前蹴り", "mixamo": "Back Leg Sweep → Knocked Down → Kip Up → Male Front Snap Kick With The Lead Foot", "seq": "sweep,fall,kip,frontkick", "category": "起き上がり", "steps": ["Back Leg Sweep", "Knocked Down", "Kip Up", "Male Front Snap Kick With The Lead Foot"]},
  {"id": 50, "title": "クロス→ノックダウン→ひねり起き→フック", "mixamo": "A Cross Punch → Knocked Down → Corkscrew Kip Up → Boxing Back Hand Hook", "seq": "cross,fall,corkscrew,hook", "category": "起き上がり", "steps": ["A Cross Punch", "Knocked Down", "Corkscrew Kip Up", "Boxing Back Hand Hook"]},
  {"id": 51, "title": "空中回避", "mixamo": "Aerial Evade", "seq": "dodge", "category": "取得済み・回避", "steps": ["Aerial Evade"], "duration": 3.6666666666666665, "source": "registered_fbx"},
  {"id": 52, "title": "Au To Role（配布名のまま）", "mixamo": "Au To Role", "seq": "dodge", "category": "取得済み・移動・回避", "steps": ["Au To Role"], "duration": 4.0, "source": "registered_fbx"},
  {"id": 53, "title": "バク転からアッパー", "mixamo": "Back Flip To Uppercut", "seq": "upper", "category": "取得済み・複合攻撃", "steps": ["Back Flip To Uppercut"], "duration": 5.833333333333333, "source": "registered_fbx"},
  {"id": 54, "title": "大きなジャンプ", "mixamo": "Big Jump", "seq": "idle", "category": "取得済み・移動", "steps": ["Big Jump"], "duration": 2.3666666666666667, "source": "registered_fbx"},
  {"id": 55, "title": "ブロッキング", "mixamo": "Blocking", "seq": "block", "category": "取得済み・防御", "steps": ["Blocking"], "duration": 1.1833333333333333, "source": "registered_fbx"},
  {"id": 56, "title": "ボディブロック", "mixamo": "Body Block", "seq": "block", "category": "取得済み・防御", "steps": ["Body Block"], "duration": 3.433333333333333, "source": "registered_fbx"},
  {"id": 57, "title": "中央へのガード", "mixamo": "Center Block", "seq": "block", "category": "取得済み・防御", "steps": ["Center Block"], "duration": 1.7666666666666666, "source": "registered_fbx"},
  {"id": 58, "title": "コンボパンチ", "mixamo": "Combo Punch", "seq": "cross", "category": "取得済み・複合攻撃", "steps": ["Combo Punch"], "duration": 2.95, "source": "registered_fbx"},
  {"id": 59, "title": "ひねり回避", "mixamo": "Corkscrew Evade", "seq": "dodge", "category": "取得済み・回避", "steps": ["Corkscrew Evade"], "duration": 2.5, "source": "registered_fbx"},
  {"id": 60, "title": "後方回避", "mixamo": "Dodging Back", "seq": "dodge", "category": "取得済み・回避", "steps": ["Dodging Back"], "duration": 2.6666666666666665, "source": "registered_fbx"},
  {"id": 61, "title": "右への回避", "mixamo": "Dodging Right", "seq": "dodge", "category": "取得済み・回避", "steps": ["Dodging Right"], "duration": 1.4333333333333333, "source": "registered_fbx"},
  {"id": 62, "title": "身かわし", "mixamo": "Dodging", "seq": "dodge", "category": "取得済み・回避", "steps": ["Dodging"], "duration": 2.3333333333333335, "source": "registered_fbx"},
  {"id": 63, "title": "ドロップキック", "mixamo": "Drop Kick", "seq": "frontkick", "category": "取得済み・蹴り", "steps": ["Drop Kick"], "duration": 2.9, "source": "registered_fbx"},
  {"id": 64, "title": "肘からアッパーのコンボ", "mixamo": "Elbow Uppercut Combo", "seq": "upper", "category": "取得済み・複合攻撃", "steps": ["Elbow Uppercut Combo"], "duration": 2.4166666666666665, "source": "registered_fbx"},
  {"id": 65, "title": "落下からローリング", "mixamo": "Falling To Roll", "seq": "fall", "category": "取得済み・移動・回避", "steps": ["Falling To Roll"], "duration": 1.7833333333333334, "source": "registered_fbx"},
  {"id": 66, "title": "空中バイシクルキック", "mixamo": "Flying Bicycle Kick", "seq": "frontkick", "category": "取得済み・蹴り", "steps": ["Flying Bicycle Kick"], "duration": 0.6666666666666666, "source": "registered_fbx"},
  {"id": 67, "title": "飛び膝・パンチコンボ", "mixamo": "Flying Knee Punch Combo", "seq": "knee", "category": "取得済み・複合攻撃", "steps": ["Flying Knee Punch Combo"], "duration": 2.6666666666666665, "source": "registered_fbx"},
  {"id": 68, "title": "ハリケーンキック", "mixamo": "Hurricane Kick", "seq": "roundkick", "category": "取得済み・蹴り", "steps": ["Hurricane Kick"], "duration": 1.8333333333333333, "source": "registered_fbx"},
  {"id": 69, "title": "肘打ち", "mixamo": "Illegal Elbow Punch", "seq": "upper", "category": "取得済み・攻撃", "steps": ["Illegal Elbow Punch"], "duration": 2.25, "source": "registered_fbx"},
  {"id": 70, "title": "内回し蹴り", "mixamo": "Inside Crescent Kick", "seq": "roundkick", "category": "取得済み・蹴り", "steps": ["Inside Crescent Kick"], "duration": 2.6666666666666665, "source": "registered_fbx"},
  {"id": 71, "title": "逆立ち二段蹴りから跳ね起き", "mixamo": "Inverted Double Kick To Kip Up", "seq": "kip", "category": "取得済み・複合攻撃", "steps": ["Inverted Double Kick To Kip Up"], "duration": 3.2, "source": "registered_fbx"},
  {"id": 72, "title": "跳び越え", "mixamo": "Jump Over", "seq": "idle", "category": "取得済み・移動", "steps": ["Jump Over"], "duration": 2.25, "source": "registered_fbx"},
  {"id": 73, "title": "飛び降り", "mixamo": "Jumping Down", "seq": "idle", "category": "取得済み・移動", "steps": ["Jumping Down"], "duration": 2.5, "source": "registered_fbx"},
  {"id": 74, "title": "膝・ジャブからアッパー", "mixamo": "Knee Jabs To Uppercut", "seq": "knee", "category": "取得済み・複合攻撃", "steps": ["Knee Jabs To Uppercut"], "duration": 5.666666666666667, "source": "registered_fbx"},
  {"id": 75, "title": "パンチ連打", "mixamo": "Punch Combo", "seq": "cross", "category": "取得済み・複合攻撃", "steps": ["Punch Combo"], "duration": 2.183333333333333, "source": "registered_fbx"},
  {"id": 76, "title": "パンチ", "mixamo": "Punching", "seq": "jab", "category": "取得済み・攻撃", "steps": ["Punching"], "duration": 1.25, "source": "registered_fbx"},
  {"id": 77, "title": "素早いロールから走りへ", "mixamo": "Quick Roll To Run", "seq": "dodge", "category": "取得済み・移動・回避", "steps": ["Quick Roll To Run"], "duration": 1.4, "source": "registered_fbx"},
  {"id": 78, "title": "待機姿勢", "mixamo": "Ready Idle", "seq": "idle", "category": "取得済み・構え", "steps": ["Ready Idle"], "duration": 2.5, "source": "registered_fbx"},
  {"id": 79, "title": "ローリングキック", "mixamo": "Roll Kicking", "seq": "roundkick", "category": "取得済み・蹴り", "steps": ["Roll Kicking"], "duration": 2.25, "source": "registered_fbx"},
  {"id": 80, "title": "回し蹴り", "mixamo": "Roundhouse Kick", "seq": "roundkick", "category": "取得済み・蹴り", "steps": ["Roundhouse Kick"], "duration": 2.5, "source": "registered_fbx"},
  {"id": 81, "title": "走りからローリング", "mixamo": "Run To Rolling", "seq": "dodge", "category": "取得済み・移動・回避", "steps": ["Run To Rolling"], "duration": 2.433333333333333, "source": "registered_fbx"},
  {"id": 82, "title": "宙返り回転蹴り", "mixamo": "Spin Flip Kick", "seq": "roundkick", "category": "取得済み・蹴り", "steps": ["Spin Flip Kick"], "duration": 3.7, "source": "registered_fbx"}
];

/** 技の種類の日本語名（2D 模式で使う）。index.html:81 の `names`。 */
export const NAMES = {jab:'ジャブ',cross:'ストレート',hook:'フック',upper:'アッパー',body:'ボディ',knee:'膝蹴り',frontkick:'前蹴り',roundkick:'回し蹴り',sweep:'足払い',head:'頭突き',tackle:'タックル',idle:'構え',block:'ブロック',dodge:'回避',hit:'被弾',fall:'転倒',kip:'キップアップ',corkscrew:'ひねりキップアップ'};

/** 種類→既定の Mixamo 名（模式の実FBX の探索で使う）。index.html:242 の `keywords`。 */
export const KEYWORDS = {jab:'Boxing Leading Hand Jab',cross:'Back Hand Cross',hook:'Boxing Lead Hand Hook',upper:'Boxing Back Hand Uppercut',body:'Body Punch To The Knee',knee:'Boxing Illegal Knee',frontkick:'Male Front Snap Kick With The Lead Foot',roundkick:'Roundhouse Kick With Front Foot Advancing',sweep:'Back Leg Sweep',fall:'Knocked Down',kip:'Kip Up',corkscrew:'Corkscrew Kip Up',idle:'Boxing Idle'};

/** FBX 名の正規化キー。index.html:229 の `norm`。 */
export const norm = (x) => x.toLowerCase().replace(/\.fbx$/, '').replace(/[^a-z0-9]/g, '');

/** 再生の尺（秒）。登録FBX由来の行は `duration` を持ち、無ければ手順数から決める。index.html:92 の `select`。 */
export function patternDuration(r) {
  return r.duration ?? Math.max(2.6, (r.seq.split('|')[0].split(',').length) * 1.05 + .8);
}

/**
 * 登録済みモーションの正規化キーの集合。index.html:236 の `restoreSaved`：種類が modelA・modelB のものは
 * モデルなので除き、残りの名前を `norm` する（旧画面は FBX を解析してアニメーションの無いものを除いたが、新UIは解析しない：§2.5 WP-05c の 1）。
 * @param {{files?: {name?: string, kind?: string}[]}|null|undefined} manifest
 * @returns {Set<string>}
 */
export function motionKeys(manifest) {
  const keys = new Set();
  for (const e of (manifest && manifest.files) || []) {
    if (!e || typeof e.name !== 'string') continue;
    if (e.kind === 'modelA' || e.kind === 'modelB') continue;
    keys.add(norm(e.name));
  }
  return keys;
}

/**
 * 全手順に実FBX がある（👑）か。index.html:233 の `motionAvailability`。
 * 手動の対応（mapping）があればそのキー、無ければ手順名の正規化キーで探す。
 * @param {{steps: string[]}} row @param {Set<string>} keys @param {Record<string, string>} [mapping]
 */
export function isAvailable(row, keys, mapping = {}) {
  return row.steps.length > 0 && row.steps.every((step) => Boolean((mapping[step] && keys.has(mapping[step])) || keys.has(norm(step))));
}
