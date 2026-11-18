const {chromium}=require('playwright');
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox','--single-process','--disable-gpu']});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true});
    await page.goto(pathToFileURL(path.resolve(__dirname,'../app/index.html')).href);
    await page.evaluate(()=>{const e=Guide.events.find(e=>e.id==='sess459--pan115');Guide.setSaved(e.id,true);});
    await page.locator('[data-tab="saved"]').click();
    const get=page.waitForEvent('download');
    await page.locator('[data-export-calendar]').click();
    const d=await get;assert.equal(d.suggestedFilename(),'SC26-itinerary.ics');
    const text=await fs.readFile(await d.path(),'utf8');
    assert.ok(text.includes('UID:sess459--pan115@sc26-field-guide.local'));
    assert.ok(text.includes('DTSTART:20261119T163000Z'));
    assert.ok(text.includes('LOCATION:W185abc'));
    await page.evaluate(()=>{window.GuideExport={writeCalendar:s=>{window.capturedExport=s;}};});
    await page.locator('[data-export-calendar]').click();
    assert.ok(await page.evaluate(()=>window.capturedExport?.includes('UID:sess459--pan115@sc26-field-guide.local')));
    console.log('PASS mobile Saved export: browser file and native bridge payload');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
