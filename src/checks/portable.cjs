const {chromium}=require('playwright');
const {pathToFileURL}=require('node:url');
const path=require('node:path'), assert=require('node:assert/strict');
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox','--single-process','--disable-gpu']});
  try{
    const p=await b.newPage({viewport:{width:390,height:844},isMobile:true});
    const outside=[],errors=[];
    p.on('pageerror',e=>errors.push(String(e)));
    await p.route(/https?:\/\//,r=>{outside.push(r.request().url());return r.abort();});
    const url=pathToFileURL(path.resolve('dist/SC26-Field-Guide.html')).href;
    await p.goto(url);
    assert.equal(await p.evaluate(()=>Guide.events.length),2335);
    await p.locator('[data-tab="people"]').click();await p.locator('[data-mode="publications"]').click();
    await p.getByRole('button',{name:/Trevor Lanting/}).click();
    await p.waitForFunction(()=>document.querySelector('.ins-profile img').naturalWidth>0);
    await p.locator('[data-tab="topics"]').click();assert.equal(await p.locator('.heat-title').count(),14);
    await p.locator('#venue').click();await p.locator('.vm-room').selectOption('rW185abc');
    await p.waitForFunction(()=>document.querySelector('.vm-image').naturalWidth>0);
    assert.ok((await p.locator('.vm-image').getAttribute('src')).startsWith('data:image/svg+xml'));
    await p.locator('#close-sheet').click();
    await p.evaluate(()=>{Guide.setSaved('sess459--pan115',true);});await p.reload();
    assert.ok(await p.evaluate(()=>Guide.isSaved('sess459--pan115')));
    assert.deepEqual(outside,[]);assert.deepEqual(errors,[]);
    console.log('PASS: standalone edition has all data, topics, portrait, room pin, and persistent bookmark with zero network requests.');
  }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
