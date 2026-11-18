const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox','--single-process','--disable-gpu']});
  try {
    const p=await b.newPage({viewport:{width:360,height:800},isMobile:true});
    await p.goto(require('node:url').pathToFileURL(require('node:path').resolve('app/index.html')).href);
    await p.evaluate(()=>Guide.openEvent('sess315--rpost208'));
    const links=await p.locator('.sheet-links a').evaluateAll(xs=>xs.map(x=>x.href));
    assert.deepEqual(links,['https://sc26.conference-program.com/presentation/?id=rpost208&sess=sess313','https://sc26.conference-program.com/session/?sess=sess315']);
    assert.ok((await p.locator('.detail-meta').innerText()).includes('Thursday'));
    assert.ok((await p.locator('.detail-note').first().innerText()).includes('Drop-in'));
    assert.ok((await p.locator('.access-fields').innerText()).includes('(session block)'));
    console.log('PASS: recurring poster keeps Thursday display and links the original work and correct day block.');
  }finally{await b.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
