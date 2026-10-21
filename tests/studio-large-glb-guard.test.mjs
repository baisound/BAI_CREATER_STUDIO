import test from 'node:test';
import assert from 'node:assert/strict';
import { libraryThumbnail } from '../studio/js/features/asset-library-preview.js';

test('a received 661 MiB stage does not start automatic thumbnail rendering', async () => {
  const previousFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = async () => { fetches += 1; throw new Error('unexpected download'); };
  try {
    const item = {
      id: 'library:large-stage',
      name: 'LAST CHASE.glb',
      kind: 'stage',
      format: 'GLB',
      bytes: 692_894_092,
      available: true,
      thumbnailUrl: '',
    };
    assert.equal(await libraryThumbnail(item), null);
    assert.equal(fetches, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
