// @ts-check
// SCR-05 の下部帯・外部コマンドと中央3Dの受け渡し。画面を離れると空にする。
/** @typedef {{play: () => Promise<void>, stop: () => void, getState: () => any, probe: (q: any) => any}} ChainControl */
/** @type {ChainControl|null} */ let current = null;
/** @param {ChainControl|null} value */
export function setChainControl(value) { current = value; }
export function currentChainControl() { return current; }
