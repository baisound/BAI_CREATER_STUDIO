'use strict';
// WP-L8a の試験用：直方体1つ（三角形12枚）だけの GLB を作る（設計 WP_L8A_VISUAL_SCALE_DETAILED_DESIGN §6.3）。
// ノード1つ・メッシュ1つ・POSITION（FLOAT VEC3、8頂点、min/max付き）と indices（UNSIGNED_SHORT、36個）。材質なし。

/** @param {number[]} min @param {number[]} max @returns {Buffer} */
function boxGlb(min, max) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max;
  const corners = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const faces = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]];
  const positions = Buffer.alloc(8 * 12);
  corners.forEach((c, i) => c.forEach((v, j) => positions.writeFloatLE(v, i * 12 + j * 4)));
  const indices = Buffer.alloc(36 * 2);
  faces.flat().forEach((v, i) => indices.writeUInt16LE(v, i * 2));
  const bin = Buffer.concat([positions, indices]); // 96 + 72 = 168（4の倍数）
  const json = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.length, target: 34962 },
      { buffer: 0, byteOffset: positions.length, byteLength: indices.length, target: 34963 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 8, type: 'VEC3', min: [x0, y0, z0], max: [x1, y1, z1] },
      { bufferView: 1, componentType: 5123, count: 36, type: 'SCALAR' }],
  };
  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  if (jsonBuf.length % 4) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(4 - (jsonBuf.length % 4), 0x20)]);
  const binPadded = bin.length % 4 ? Buffer.concat([bin, Buffer.alloc(4 - (bin.length % 4))]) : bin;
  const header = Buffer.alloc(12);
  header.write('glTF', 0); header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binPadded.length, 8);
  const chunk = (type, data) => { const h = Buffer.alloc(8); h.writeUInt32LE(data.length, 0); h.write(type, 4); return Buffer.concat([h, data]); };
  return Buffer.concat([header, chunk('JSON', jsonBuf), chunk('BIN\0', binPadded)]);
}

module.exports = { boxGlb };
