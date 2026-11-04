'use strict';
// WP-L6 旧保存取込の画面（設計書 docs/roadmap/LEGACY_STATE_TO_V05_MAPPING_DESIGN_20261104_JA.md §7・WP-L6）。
// 隔離サーバー（実 data/ には触れない）と Playwright（1280x720）で、作品カードのボタン1つと対話画面を数値で判定する。
// skip は使わない。3D 描画の確認は studio-v05-legacy-import-ui-3d.test.cjs に分けてある。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const harness = require('./helpers/studio-harness.cjs');
const seed = require('./helpers/legacy-import-seed.cjs');

const { ok, post } = seed;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name);
    if (name.isDirectory()) walk(full, out); else out.push(full);
  }
  return out;
}
/** dataDir の下の studio_v05_* の全ファイル（再帰）の SHA-256。 */
function v05Hashes(dataDir) {
  const result = {};
  for (const entry of fs.readdirSync(dataDir)) {
    if (!entry.startsWith('studio_v05_')) continue;
    const full = path.join(dataDir, entry);
    for (const file of fs.statSync(full).isDirectory() ? walk(full) : [full])
      result[path.relative(dataDir, file)] = sha(fs.readFileSync(file));
  }
  return result;
}

// 設計書 §3.4 の文（全文一致で照合する）
const FPS_CONFLICT_24_30 = '作品のFPS（24fps）と旧保存のFPS（30fps）が違います。［作品のFPSを30fpsに変えて取り込む］を押すと、作品のFPSを変えてから取り込みます。';
const TARGET_NOT_EMPTY = 'この作品には、すでにクリップか3D場面があります。ホームの［＋ 新規作成］で空の作品を作り、その作品カードで［現行編集を保存］→［旧保存を取り込む…］の順に押してください。';
const SOURCE_CHANGED = '確認したあとに、スナップショットか曲とダンスなどの保存が変わりました。［もう一度確認する］を押してください。';
const IMPORT_INTERRUPTED = '前回の取込または取消が途中で止まっています。［取込を取消］を押して、取込前に戻してください。';
const STATUS_IMPORTED = /^取り込みました：写したもの(\d+)件、写さなかったもの(\d+)件、注意(\d+)件$/;
const INTERNAL_NAMES = /scene_instances|playhead|arrangement|catalog|\/workspace\/|\/camera\/|[A-Z_]{6,}/;

test('v0.5 legacy import dialog: one card button, summary, confirm/cancel, apply, revert, rejections',
  { timeout: 300000 }, async (t) => {
    const server = await harness.startServer({ port: 8941 });
    let browser, page;
    try {
      const base = server.base;
      const ids = await seed.registerAssets(base);
      seed.writeLegacyFiles(server.dataDir, ids);
      const projects = {};
      for (const key of ['main', 'fps', 'full', 'stale', 'broken']) {
        const name = `取込試験${key}`;
        if (key === 'full') { // 空でない作品（スナップショットの前に場面インスタンスを1件足す）
          const created = await ok(await post(base, '/api/studio/v05/projects', { name, kind: 'empty' }));
          await ok(await post(base, '/api/studio/v05/scene/instances', {
            project_id: created.project.id, action: 'add', revision: 0, asset_id: ids.model,
            transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }));
          await ok(await post(base, '/api/studio/v05/project/snapshot', { id: created.project.id }));
          projects[key] = created.project.id;
        } else projects[key] = await seed.createProjectWithSnapshot(base, name);
      }
      await ok(await post(base, '/api/studio/v05/project/fps', { project_id: projects.fps, fps: 24 }));

      browser = await server.launchBrowser();
      page = await server.newPage(browser, { viewport: { width: 1280, height: 720 } });
      const applyPosts = [], conflicts = [];
      // 確認のあとにスナップショットが変わったときの 409（SOURCE_CHANGED）だけは、ブラウザーが console に出す想定内のエラー
      harness.expectErrors(page, [/status of 409 \(Conflict\)/]);
      page.on('response', response => { if (response.status() === 409) conflicts.push(response.url()); });
      page.on('request', request => {
        if (request.method() === 'POST' && /legacy-import\/(apply|revert)/.test(request.url())) applyPosts.push(request.url());
      });
      await page.goto(`${base}/studio/v05/index.html`);
      await page.evaluate(() => window.baiGo('projects'));
      const list = page.locator('#baiProjectList');
      const card = key => list.locator('.baiCard', { has: page.locator('h3', { hasText: `取込試験${key}` }) });
      const legacyButton = key => card(key).locator('[data-v05-legacy-import]');
      const dialog = page.locator('#v188LegacyImport');
      const api = async (route, init) => ok(await fetch(`${base}${route}`, init));
      const instances = async id => (await api(`/api/studio/v05/scene/instances?id=${id}`)).instances;
      const clips = async id => (await api(`/api/studio/v05/arrangement?id=${id}`)).clips;
      const projectFps = async id => api(`/api/studio/v05/project/fps?id=${id}`);
      const previewApi = (id, include = '') => api(`/api/studio/v05/project/legacy-import-preview?id=${id}&include=${include}`);
      const openDialog = async key => {
        await legacyButton(key).click();
        await dialog.waitFor({ state: 'visible' });
        await page.waitForFunction(() => !document.querySelector('#v188LegacyImport [role="status"]')?.textContent.includes('読み込み中') &&
          !document.querySelector('#v188LegacyImport')?.textContent.includes('読み込み中です'));
      };
      const primary = () => dialog.locator('.v188-buttons button.primary');

      await list.locator('.baiCard').first().waitFor();

      await t.test('card: exactly one legacy-import button per card, one more button than before', async () => {
        const result = await page.evaluate(() => [...document.querySelectorAll('#baiProjectList .baiCard')].map(node => ({
          total: node.querySelectorAll('button').length,
          legacy: node.querySelectorAll('[data-v05-legacy-import]').length,
          others: node.querySelectorAll('button:not([data-v05-legacy-import])').length,
          text: node.querySelector('[data-v05-legacy-import]')?.textContent,
        })));
        assert.equal(result.length, 5);
        for (const row of result) {
          assert.equal(row.legacy, 1);
          assert.equal(row.others, 3, '変更前のカードのボタンは3つ（編集する・現行編集を保存・保存状態を確認）');
          assert.equal(row.total, row.others + 1);
          assert.equal(row.text, '旧保存を取り込む…');
        }
      });

      await t.test('dialog: source, summary first, details rows, plain-Japanese names, terms, layout, cancel writes nothing', async () => {
        // 作品「main」を編集画面で選んでからホームへ戻る（取込後にタイムラインが作り直されるかを見るため）
        await card('main').locator('[data-openproject]').click();
        await page.waitForFunction(id => document.querySelector('#v06project')?.value === id, projects.main);
        await page.evaluate(() => window.baiGo('projects'));
        await list.waitFor({ state: 'visible' });
        const listBefore = await list.boundingBox();
        await openDialog('main');
        const viewport = { width: 1280, height: 720 };
        const box = await dialog.boundingBox();
        assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= viewport.width && box.y + box.height <= viewport.height,
          `対話画面が画面の外に出ています: ${JSON.stringify(box)}`);
        // 見出し・取込元
        assert.equal((await dialog.locator('h2').innerText()).trim(), '旧画面の保存を、この作品へ取り込む');
        const preview = await previewApi(projects.main);
        const source = (await dialog.locator('[data-role="source"]').innerText()).trim();
        assert.ok(source.startsWith(`旧保存の名前：${preview.source_info.title}／スナップショットを保存した日時：`), source);
        assert.match(source, /^旧保存の名前：歌ってみた試験作品／スナップショットを保存した日時：\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} JST／キャラクター：test\.pmx／ステージ：stage$/);
        const jstSaved = new Date(Date.parse(preview.source_info.snapshot_saved_at) + 9 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
        assert.ok(source.includes(jstSaved), `日本時間の変換が違います: ${source} / ${jstSaved}`);
        // 要約：2行、順番は「写るもの」→「写らないもの」で、どちらも取込元・追加の取込より前の本文に出る
        const mapped = (await dialog.locator('[data-role="mapped"]').innerText()).trim();
        const kept = (await dialog.locator('[data-role="kept"]').innerText()).trim();
        assert.ok(mapped.startsWith('写るもの：'), mapped);
        assert.ok(kept.startsWith('写らないもの（取込記録に残ります）：'), kept);
        assert.equal(mapped, `写るもの：${preview.summary.mapped.join('、')}`);
        assert.equal(kept, `写らないもの（取込記録に残ります）：${preview.summary.kept.join('、')}`);
        const order = await dialog.locator('.v188-body').evaluate(node => [...node.children].map(child => child.dataset.role || child.tagName));
        assert.deepEqual(order.slice(0, 3), ['source', 'mapped', 'kept']);
        // 詳細の表の行数 = API の items の件数。最初は閉じている
        assert.equal(await dialog.locator('[data-role="details"]').evaluate(node => node.open), false);
        assert.equal(await dialog.locator('[data-role="details"] tbody tr').count(), preview.items.length);
        assert.ok(preview.items.length > 0);
        // 追加の取込は既定でオフ。注釈がある
        const boxes = await dialog.locator('input[type=checkbox][data-include]').evaluateAll(nodes => nodes.map(n => ({ checked: n.checked, disabled: n.disabled })));
        assert.deepEqual(boxes, [{ checked: false, disabled: false }, { checked: false, disabled: true }],
          '曲とダンスは選べ、旧タイムライン編集は保存が無いので選べない');
        assert.match(await dialog.innerText(), /この2つは作品ごとではなく、パソコン全体で1つの保存です。取り込みたい作品の内容になっているか、旧画面で確かめてから選んでください。/);
        assert.match(await dialog.locator('label:has([data-include="timeline_editor"])').innerText(), /保存がありません/);
        // 内部の名前を出さない（詳細を開いた状態でも）
        await dialog.locator('[data-role="details"] summary').click();
        const text = await dialog.innerText();
        assert.doesNotMatch(text, INTERNAL_NAMES);
        for (const row of preview.items) assert.doesNotMatch(row.label, /\/|[A-Z_]{6,}/);
        // 注釈：用語は空でない title を持つ abbr の中。画面中のすべての出現が abbr の中
        for (const word of ['スナップショット', 'FPS', '取込記録']) {
          const info = await dialog.evaluate((node, term) => {
            const abbrs = [...node.querySelectorAll('abbr')].filter(a => a.textContent === term);
            const inAbbr = abbrs.length;
            const plain = (node.innerText.match(new RegExp(term, 'g')) || []).length;
            return { inAbbr, plain, titles: abbrs.map(a => a.title) };
          }, word);
          assert.ok(info.inAbbr >= 1, `${word} の abbr がありません`);
          assert.ok(info.titles.every(title => title.length > 0), `${word} の title が空です`);
          assert.equal(info.inAbbr, info.plain, `${word} が abbr の外に出ています`);
        }
        // 詳細を開いても画面の中に収まり、内容が長いときは対話画面の中だけがスクロールする
        const opened = await dialog.boundingBox();
        assert.ok(opened.y >= 0 && opened.y + opened.height <= viewport.height, JSON.stringify(opened));
        const overflow = await dialog.locator('.v188-body').evaluate(node => getComputedStyle(node).overflowY);
        assert.equal(overflow, 'auto');
        // 背面の作品一覧は動かない（開いている間も、閉じた後も 1px 以内）
        const listOpen = await list.boundingBox();
        for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(listOpen[key] - listBefore[key]) <= 1, `開いている間に一覧が動きました: ${key}`);
        await dialog.locator('[data-act="close"]').click();
        await dialog.waitFor({ state: 'hidden' });
        const listAfter = await list.boundingBox();
        for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(listAfter[key] - listBefore[key]) <= 1, `閉じた後に一覧が動きました: ${key}`);
      });

      await t.test('cancel: pressing [やめる] after [取り込む] sends and writes nothing', async () => {
        const before = v05Hashes(server.dataDir);
        assert.ok(Object.keys(before).length > 0);
        const posts = applyPosts.length;
        await openDialog('main');
        await primary().click();
        assert.equal((await dialog.locator('[data-role="confirm"] p').innerText()).trim(), 'この作品へ取り込みます。あとで［取込を取消］で戻せます。');
        assert.deepEqual(await dialog.locator('[data-role="confirm"] button').allInnerTexts(), ['取り込む（確定）', 'やめる']);
        await dialog.locator('[data-act="cancel-confirm"]').click();
        assert.equal(await dialog.locator('[data-role="confirm"]').count(), 0);
        assert.equal((await primary().innerText()).trim(), '取り込む');
        assert.equal(applyPosts.length, posts, '適用・取消の要求が送られました');
        assert.deepEqual(v05Hashes(server.dataDir), before, '［やめる］で studio_v05_* が変わりました');
        await dialog.locator('[data-act="close"]').click();
        assert.deepEqual(v05Hashes(server.dataDir), before);
      });

      await t.test('apply with music/dance: instances, clips, timeline redraw, result line; reload shows [取込を取消]', async () => {
        const fpsBefore = await projectFps(projects.main);
        assert.equal(fpsBefore.configured, false);
        await openDialog('main');
        await dialog.locator('input[data-include="music_dance"]').check();
        await page.waitForFunction(() => document.querySelector('#v188LegacyImport input[data-include="music_dance"]')?.checked);
        const withMusic = await previewApi(projects.main, 'music_dance');
        assert.equal(await dialog.locator('[data-role="details"] tbody tr').count(), withMusic.items.length);
        assert.match(await dialog.locator('label:has([data-include="music_dance"])').innerText(), /曲とダンスの画面（SCR-10）の曲とダンスも取り込む（最終更新：\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} JST）/);
        await primary().click();
        await dialog.locator('[data-act="confirm-apply"]').click();
        await page.waitForFunction(() => /^取り込みました/.test(document.querySelector('#v188LegacyImport [role="status"]')?.textContent || ''));
        const status = (await dialog.locator('[role="status"]').innerText()).trim();
        const found = status.match(STATUS_IMPORTED);
        assert.ok(found, status);
        assert.deepEqual(found.slice(1).map(Number), [withMusic.summary.mapped_count, withMusic.summary.kept_count, withMusic.summary.warnings]);
        assert.equal((await instances(projects.main)).length, 2);
        const placed = await clips(projects.main);
        assert.equal(placed.length, 2);
        assert.deepEqual((await projectFps(projects.main)).fps, 30);
        // 画面への知らせ：タイムラインは読み直し不要で作り直される
        await page.waitForFunction(count => document.querySelectorAll('#v07timeline [data-clip-id]').length === count, placed.length);
        assert.equal(await page.locator('#v07timeline [data-clip-id]').count(), placed.length);
        assert.equal((await primary().innerText()).trim(), '取込を取消');
        await dialog.locator('[data-act="close"]').click();
        // 再読込
        await page.reload();
        await page.evaluate(() => window.baiGo('projects'));
        await list.locator('.baiCard').first().waitFor();
        await openDialog('main');
        assert.equal((await primary().innerText()).trim(), '取込を取消');
        assert.match(await dialog.locator('[data-role="source"]').innerText(), /^旧保存の名前：歌ってみた試験作品／スナップショットを保存した日時：.* JST／キャラクター：test\.pmx／ステージ：stage$/);
        assert.equal(await dialog.locator('[data-role="reject"]').innerText(),
          'この作品には取込済みです。やり直すときは、［取込を取消］を押してから、もう一度［取り込む］を押してください。');
        await dialog.locator('[data-act="close"]').click();
      });

      await t.test('revert after the playhead was moved three times: instances and clips removed, FPS back, playhead kept', async () => {
        let revision = (await api(`/api/studio/v05/playhead?id=${projects.main}`)).revision;
        let last;
        for (const seconds of [1.5, 2.5, 3.5]) {
          last = await api('/api/studio/v05/playhead', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project_id: projects.main, seconds, revision }) });
          revision = last.revision;
        }
        await openDialog('main');
        await primary().click();
        assert.equal((await dialog.locator('[data-role="confirm"] p').innerText()).trim(),
          '取り込んだキャラクター・ステージ・クリップを、あとで動かした分も含めて削除します。再生位置はそのままです。表情キーのUndo履歴は空になります。');
        assert.deepEqual(await dialog.locator('[data-role="confirm"] button').allInnerTexts(), ['取消（確定）', 'やめる']);
        const before = v05Hashes(server.dataDir);
        await dialog.locator('[data-act="cancel-confirm"]').click();
        assert.deepEqual(v05Hashes(server.dataDir), before, '取消の［やめる］で何かが書かれました');
        await primary().click();
        await dialog.locator('[data-act="confirm-revert"]').click();
        await page.waitForFunction(() => /^取込を取り消しました/.test(document.querySelector('#v188LegacyImport [role="status"]')?.textContent || ''));
        assert.equal((await instances(projects.main)).length, 0);
        assert.equal((await clips(projects.main)).length, 0);
        assert.equal((await projectFps(projects.main)).configured, false);
        assert.equal((await api(`/api/studio/v05/playhead?id=${projects.main}`)).seconds, 3.5);
        await page.waitForFunction(() => document.querySelectorAll('#v07timeline [data-clip-id]').length === 0);
        assert.equal((await primary().innerText()).trim(), '取り込む', '取消のあとはもう一度取り込める');
        await dialog.locator('[data-act="close"]').click();
      });

      await t.test('rejection: FPS conflict shows the exact sentence and a button that applies the project FPS', async () => {
        await openDialog('fps');
        assert.equal((await dialog.locator('[data-role="reject"]').innerText()).trim(), FPS_CONFLICT_24_30);
        assert.equal((await primary().innerText()).trim(), '作品のFPSを30fpsに変えて取り込む');
        assert.equal(await dialog.locator('.v188-buttons button').count(), 2, '主ボタンと［閉じる］だけ');
        assert.doesNotMatch(await dialog.innerText(), INTERNAL_NAMES);
        await primary().click();
        assert.equal((await dialog.locator('[data-role="confirm"] p').innerText()).trim(), 'この作品へ取り込みます。あとで［取込を取消］で戻せます。');
        await dialog.locator('[data-act="confirm-apply"]').click();
        await page.waitForFunction(() => /^取り込みました/.test(document.querySelector('#v188LegacyImport [role="status"]')?.textContent || ''));
        assert.equal((await projectFps(projects.fps)).fps, 30);
        assert.equal((await instances(projects.fps)).length, 2);
        await dialog.locator('[data-act="close"]').click();
      });

      await t.test('rejection: non-empty project shows the exact sentence and no main button', async () => {
        await openDialog('full');
        assert.equal((await dialog.locator('[data-role="reject"]').innerText()).trim(), TARGET_NOT_EMPTY);
        assert.equal(await primary().count(), 0);
        assert.deepEqual(await dialog.locator('.v188-buttons button').allInnerTexts(), ['閉じる']);
        assert.doesNotMatch(await dialog.innerText(), INTERNAL_NAMES);
        await dialog.locator('[data-act="close"]').click();
      });

      await t.test('rejection: snapshot changed after the check shows [もう一度確認する], which checks again', async () => {
        await openDialog('stale');
        await primary().click();
        // 確認のあとにスナップショットを保存し直す（旧の作業状態を変えて、保存の内容を変える）
        const workspacePath = path.join(server.dataDir, 'project_state.workspace.json');
        const workspace = JSON.parse(fs.readFileSync(workspacePath, 'utf8'));
        workspace.frame = 121;
        fs.writeFileSync(workspacePath, JSON.stringify(workspace));
        await ok(await post(base, '/api/studio/v05/project/snapshot', { id: projects.stale }));
        const stateBefore = v05Hashes(server.dataDir);
        await dialog.locator('[data-act="confirm-apply"]').click();
        await page.waitForFunction(() => document.querySelector('#v188LegacyImport [data-act="recheck"]'));
        assert.equal((await dialog.locator('[data-role="reject"]').innerText()).trim(), SOURCE_CHANGED);
        assert.equal((await primary().innerText()).trim(), 'もう一度確認する');
        assert.deepEqual(v05Hashes(server.dataDir), stateBefore, '拒否のあとに何かが書かれました');
        await primary().click();
        await page.waitForFunction(() => document.querySelector('#v188LegacyImport [data-act="start-apply"]'));
        assert.equal((await primary().innerText()).trim(), '取り込む');
        assert.equal(await dialog.locator('[data-role="reject"]').count(), 0);
        await dialog.locator('[data-act="close"]').click();
      });

      await t.test('interrupted record: message, [取込を取消] and its confirmation; [やめる] writes nothing; confirm restores', async () => {
        await openDialog('broken');
        await primary().click();
        await dialog.locator('[data-act="confirm-apply"]').click();
        await page.waitForFunction(() => /^取り込みました/.test(document.querySelector('#v188LegacyImport [role="status"]')?.textContent || ''));
        await dialog.locator('[data-act="close"]').click();
        // 取込の途中で止まった記録に見せる（記録の状態だけを applying に書き換える。手順は完了済みのまま）
        const recordPath = path.join(server.dataDir, 'studio_v05_legacy_imports', `${projects.broken}.json`);
        const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
        record.state = 'applying';
        fs.writeFileSync(recordPath, JSON.stringify(record));
        await openDialog('broken');
        assert.equal((await dialog.locator('[data-role="reject"]').innerText()).trim(), IMPORT_INTERRUPTED);
        assert.equal((await primary().innerText()).trim(), '取込を取消');
        await primary().click();
        assert.equal((await dialog.locator('[data-role="confirm"] p').innerText()).trim(), '前回の操作が途中で止まっています。取込前に戻します。');
        const before = v05Hashes(server.dataDir);
        await dialog.locator('[data-act="cancel-confirm"]').click();
        assert.deepEqual(v05Hashes(server.dataDir), before);
        await primary().click();
        await dialog.locator('[data-act="confirm-interrupted"]').click();
        await page.waitForFunction(() => /^取込を取り消しました/.test(document.querySelector('#v188LegacyImport [role="status"]')?.textContent || ''));
        assert.equal((await instances(projects.broken)).length, 0);
        await dialog.locator('[data-act="close"]').click();
      });

      assert.equal(conflicts.length, 1, `409 は SOURCE_CHANGED の1回だけのはず: ${conflicts}`);
      assert.match(conflicts[0], /legacy-import\/apply$/);
      harness.assertNoErrors(page);
    } finally {
      await page?.close(); await browser?.close(); await server.stop();
    }
  });
