/* Run with the app served at GUIDE_URL; exercises the actual mobile view. */
const {chromium} = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM || '/usr/bin/chromium', args:['--no-sandbox','--single-process','--disable-gpu']});
  try {
    const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
    const errors = [];
    page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(process.env.GUIDE_URL || require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../app/index.html')).href);
    await page.locator('#tabs [data-tab="schedule"]').waitFor();
    const result = await page.evaluate(()=>{
      const named = [...new Set(Guide.events.map(e=>e.room))];
      return {mapped:named.filter(name=>Venue.resolve(name)).length,
        missing:named.filter(name=>!Venue.resolve(name)),floors:SC_MAPS.floors.length};
    });
    assert.ok(result.mapped >= 60,JSON.stringify(result));
    await page.locator('#venue').click();
    for (const floor of await page.locator('.vm-floor option').evaluateAll(opts=>opts.map(o=>o.value))) {
      await page.locator('.vm-floor').selectOption(floor);
      await page.waitForFunction(()=>document.querySelector('.vm-image').complete && document.querySelector('.vm-image').naturalWidth>0);
    }
    await page.locator('.vm-room').selectOption('rW178ab');
    assert.match(await page.locator('.vm-caption').innerText(), /W178ab.*West 1/);
    const pinInside = ()=>page.evaluate(()=>{
      const p=document.querySelector('.vm-pin').getBoundingClientRect();
      const v=document.querySelector('.vm-viewport').getBoundingClientRect();
      return p.left>=v.left && p.right<=v.right && p.top>=v.top && p.bottom<=v.bottom;
    });
    assert.ok(await pinInside());
    const getWidth=()=>page.locator('.vm-canvas').evaluate(e=>e.clientWidth);
    const width=await getWidth();
    await page.locator('.vm-in').click();assert.ok(await getWidth()>width);assert.ok(await pinInside());
    await page.locator('.vm-out').click();assert.ok(Math.abs(await getWidth()-width)<=1);
    await page.locator('#close-sheet').click();
    const id=await page.evaluate(()=>Guide.events.find(e=>e.room==='W178ab' && e.parentId).id);
    await page.evaluate(id=>Guide.openEvent(id),id);
    const eventTitle=await page.locator('#sheet-title').innerText();
    await page.locator('[data-map-event]').click();
    assert.ok(await pinInside());
    await page.locator('.vm-back').click();assert.equal(await page.locator('#sheet-title').innerText(),eventTitle);
    await page.locator('#close-sheet').click();
    for (const [room,label] of [['Griffin Museum of Science & Industry','Off-site reception'],['Central Concourse','West Level 3']]) {
      await page.evaluate(name=>Venue.open(name),room);
      assert.ok((await page.locator('.vm-unmapped').innerText()).includes(label));
      await page.locator('#close-sheet').click();
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: seven offline floor plans, room matching, marker, zoom and session round trip.',result);
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
