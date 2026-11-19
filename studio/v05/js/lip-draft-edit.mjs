// Local editing only. Persistence and source/revision checks remain in lip_drafts.
const copy = value => structuredClone(value);
export function splitSegment(rows, index) {
  if (!Number.isInteger(index) || index < 0 || index >= rows.length) throw Error('区間を選んでください。');
  if (rows.length >= 1000) throw Error('区間は1000件までです。');
  const segment = rows[index], first = segment.startFrame === '' ? NaN : Number(segment.startFrame), last = segment.endFrame === '' ? NaN : Number(segment.endFrame);
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last > 1000000 || last - first < 2)
    throw Error('分割する区間は2フレーム以上の整数範囲にしてください。');
  const middle = first + Math.floor((last - first) / 2), result = copy(rows);
  result.splice(index, 1, {...copy(segment), endFrame: String(middle)}, {...copy(segment), startFrame: String(middle)});
  return result;
}
export function removeSegment(rows, index) {
  if (rows.length <= 1) throw Error('最後の区間は残します。発話全体を無音にする場合は明示無音を選んでください。');
  if (!Number.isInteger(index) || index < 0 || index >= rows.length) throw Error('区間を選んでください。');
  return copy(rows).filter((_, i) => i !== index);
}
export function createSegmentHistory(limit = 32) {
  let current = [], past = [], future = [];
  return {
    reset(rows) { current = copy(rows); past = []; future = []; },
    differs(rows) { return JSON.stringify(rows) !== JSON.stringify(current); },
    commit(rows) {
      if (JSON.stringify(rows) === JSON.stringify(current)) return;
      past.push(current); if (past.length > limit) past.shift();
      current = copy(rows); future = [];
    },
    undo() { if (!past.length) return null; future.push(current); current = past.pop(); return copy(current); },
    redo() { if (!future.length) return null; past.push(current); current = future.pop(); return copy(current); },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
  };
}
