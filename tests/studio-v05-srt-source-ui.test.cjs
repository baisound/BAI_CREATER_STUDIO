'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const harness=require('./helpers/studio-harness.cjs');

test('v0.5 SRT panel imports originals and saves readings separately from source cues',async()=>{
  const server=await harness.startServer({port:8931});
  let browser,page;
  const original=Buffer.from('1\r\n00:00:01,250 --> 00:00:02,750\r\nあいう\r\n\r\n2\r\n00:00:02,500 --> 00:00:03,000\r\n歌詞\r\n','utf8');
  const hash=crypto.createHash('sha256').update(original).digest('hex');
  try{
    const create=async(name)=>{
      const response=await fetch(`${server.base}/api/studio/v05/projects`,{method:'POST',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({name,kind:'empty'})});
      assert.equal(response.status,200);return (await response.json()).project.id;
    };
    const a=await create('SRT画面A'),b=await create('SRT画面B');
    browser=await server.launchBrowser();page=await server.newPage(browser);
    await page.goto(`${server.base}/studio/v05/index.html`);
    await page.locator('#v06project').selectOption(a);
    await page.locator('#nav [data-workspace="edit"]').click();
    await page.locator('#v187-srt-panel > summary').click();
    await page.waitForFunction(()=>document.querySelector('#v187-status')?.textContent.includes('0件'));
    await page.locator('#v187-file').setInputFiles({name:'歌詞.srt',mimeType:'text/plain',buffer:original});
    await page.locator('#v187-import').click();
    assert.match(await page.locator('#v187-status').textContent(),/文字コードを明示/);
    await page.locator('#v187-encoding').selectOption('utf-8');
    const uploaded=page.waitForResponse(response=>response.url().includes('/srt/import')&&
      response.request().method()==='POST');
    await page.locator('#v187-import').click();
    assert.equal((await uploaded).status(),200);
    await page.waitForFunction(()=>document.querySelector('#v187-status')?.textContent.includes('2発話'));
    assert.match(await page.locator('#v187-status').textContent(),/時間重なり 1件/);
    assert.match(await page.locator('#v187-source-info').textContent(),/原本照合済み／2発話／時間重なり 1件/);
    assert.match(await page.locator('#v187-cues').textContent(),/00:00:01,250 → 00:00:02,750/);
    assert.match(await page.locator('#v187-cues').textContent(),/あいう/);
    const metadata=await(await fetch(`${server.base}/api/studio/v05/srt/sources?project_id=${a}`)).json();
    assert.equal(metadata.revision,1);
    assert.equal(metadata.sources[0].sha256,hash);
    const source=path.join(server.dataDir,'studio_v05_srt_sources',a,'sources',hash+'.srt');
    assert.deepEqual(fs.readFileSync(source),original);
    assert.equal(await page.locator('#v190-reading-editor').isVisible(),true);
    await page.locator('#v190-reading-state').selectOption('confirmed');
    await page.locator('#v190-reading-kana').fill('アイウ');
    let readings=await(await fetch(`${server.base}/api/studio/v05/lip/readings?project_id=${a}`)).json();
    assert.equal(readings.revision,0,'読みは保存ボタンまで変更しない');
    let savedReading=page.waitForResponse(response=>response.url().includes('/lip/readings')&&
      response.request().method()==='POST');
    await page.locator('#v190-reading-save').click();
    assert.equal((await savedReading).status(),200);
    await page.waitForFunction(()=>document.querySelector('#v190-reading-status')?.textContent.includes('確定済み'));
    readings=await(await fetch(`${server.base}/api/studio/v05/lip/readings?project_id=${a}`)).json();
    assert.equal(readings.revision,1);
    assert.equal(readings.utterances[0].readingKana,'アイウ');
    assert.equal(readings.utterances[0].sourceStartMs,1250);
    assert.equal(readings.utterances[0].sourceEndMs,2750);
    assert.deepEqual(fs.readFileSync(source),original);
    await page.locator('#v187-cues [data-index="2"]').click();
    await page.locator('#v190-explicit-silence').check();
    assert.equal(await page.locator('#v190-reading-state').inputValue(),'unresolved');
    savedReading=page.waitForResponse(response=>response.url().includes('/lip/readings')&&
      response.request().method()==='POST');
    await page.locator('#v190-reading-save').click();
    assert.equal((await savedReading).status(),200);
    await page.waitForFunction(()=>document.querySelector('#v190-reading-status')?.textContent.includes('明示無音'));
    readings=await(await fetch(`${server.base}/api/studio/v05/lip/readings?project_id=${a}`)).json();
    assert.equal(readings.revision,2);
    assert.equal(readings.utterances[1].explicitSilence,true);
    assert.equal(readings.utterances[1].readingKana,null);
    assert.deepEqual(fs.readFileSync(source),original);
    await page.locator('#v187-cues [data-index="1"]').click();
    await page.locator('#v190-reading-kana').fill('歌詞');
    harness.expectErrors(page,[/Failed to load resource: the server responded with a status of 422/]);
    savedReading=page.waitForResponse(response=>response.url().includes('/lip/readings')&&
      response.request().method()==='POST');
    await page.locator('#v190-reading-save').click();
    assert.equal((await savedReading).status(),422);
    await page.waitForFunction(()=>document.querySelector('#v190-reading-status')?.textContent.includes('保存に失敗'));
    assert.equal(await page.locator('#v190-reading-kana').inputValue(),'アイウ');
    assert.equal((await(await fetch(`${server.base}/api/studio/v05/lip/readings?project_id=${a}`)).json()).revision,2);

    await page.reload();
    await page.locator('#v06project').selectOption(a);
    await page.locator('#nav [data-workspace="edit"]').click();
    await page.locator('#v187-srt-panel > summary').click();
    await page.waitForFunction(()=>document.querySelector('#v187-source-info')?.textContent.includes('2発話'));
    assert.match(await page.locator('#v187-cues').textContent(),/歌詞/);
    assert.equal(await page.locator('#v190-reading-state').inputValue(),'confirmed');
    assert.equal(await page.locator('#v190-reading-kana').inputValue(),'アイウ');
    await page.locator('#v187-cues [data-index="2"]').click();
    assert.equal(await page.locator('#v190-explicit-silence').isChecked(),true);
    await page.locator('#v06project').selectOption(b);
    await page.waitForFunction(()=>document.querySelector('#v187-source-info')?.textContent.includes('ありません'));
    assert.equal(await page.locator('#v190-reading-editor').isVisible(),false);
    await page.locator('#v06project').selectOption(a);
    await page.waitForFunction(()=>document.querySelector('#v187-source-info')?.textContent.includes('2発話'));
    fs.writeFileSync(source,'changed');
    await page.locator('#v187-refresh').click();
    await page.waitForFunction(()=>document.querySelector('#v187-source-info')?.textContent.includes('内容が変わりました'));
    assert.equal(await page.locator('#v190-reading-save').isDisabled(),true);
    harness.assertNoErrors(page);
  }finally{await browser?.close();await server.stop();}
});
