const {chromium}=require('playwright');const assert=require('node:assert/strict');(async()=>{
const b=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox','--single-process','--disable-gpu']});
const p=await b.newPage({viewport:{width:320,height:720},hasTouch:true,isMobile:true});
await p.clock.install({time:new Date('2026-11-18T16:30:00Z')});
await p.goto('file://'+process.cwd()+'/app/index.html');const nav=s=>p.locator('[data-tab="'+s+'"]').click();
await nav('people');await p.locator('[data-ia="more-people"]').click();assert(await p.locator('[data-ia="person"]').count()>32);
await p.locator('[data-ifield="person-query"]').fill('zzzz111noone');assert(await p.locator('.ins-empty').isVisible());
await p.locator('[data-mode="countries"]').click();await p.locator('[data-ia="group"]').first().click();await p.locator('[data-ia="person"]').first().click();
assert(await p.evaluate(()=>Guide.back()));assert(await p.locator('.ins-group-head').isVisible());assert(await p.evaluate(()=>Guide.back()));assert(await p.locator('[data-ia="group"]').first().isVisible());
await nav('topics'); const title = p.locator('[data-ia="expand-topic"]').first();await title.click();assert(await p.evaluate(()=>Guide.back()));assert(await p.locator('.heat-detail').count()===0);
await nav('planner');await p.locator('[data-ifield="plan-day"]').selectOption('2026-11-18');await p.locator('[data-ifield="from-now"]').check();await p.locator('[data-ia="pick"][data-topic="ai"]').click();await p.locator('[data-ia="build"]').click();
const ids=await p.locator('.ins-stops [data-ia="event"]').evaluateAll(items=>items.map(i=>i.dataset.id));const starts=await p.evaluate(ids=>ids.map(id=>Guide.events.find(e=>e.id===id).start),ids);
assert(starts.length&&starts.every(s=>s>='10:30'));const ds=await p.locator('.ins-drop .ins-stop').count();
if(await p.locator('[data-ia="more-drops"]').count()){await p.locator('[data-ia="more-drops"]').click();assert(await p.locator('.ins-drop .ins-stop').count()>ds);}
const pair=await p.evaluate(()=>{const items=Guide.events.filter(e=>e.day==='2026-11-18'&&e.format==='Paper'&&e.start==='10:30'&&!e.parentId);return items.slice(0,2).map(e=>e.id);});assert.equal(pair.length,2);
await p.evaluate(ids=>Guide.saveIds(ids),pair); await nav('saved');await nav('planner');assert(await p.locator('.ins-conflicts li').count()>0);
assert(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
console.log(JSON.stringify({fromNowStops:ids.length,earliest:starts[0],postersExpanded:ds,confirmedPinnedConflict:pair,overflow320:false}));await b.close()
})().catch(err=>{console.error(err);process.exit(1)});
