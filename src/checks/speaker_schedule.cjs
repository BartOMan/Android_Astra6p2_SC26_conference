const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox','--single-process','--disable-gpu']});const p=await b.newPage({viewport:{width:360,height:720},hasTouch:true,isMobile:true});
 await p.clock.install({time:new Date('2026-11-18T16:30:00Z')});await p.goto('file://'+process.cwd()+'/app/index.html');
 const profile=async name=>p.evaluate(n=>{Guide.show('people');Insights.openPerson(Guide.people.find(q=>q.name===n).id)},name);
 await profile('Trevor Lanting');let next=await p.locator('.ins-next').innerText();assert(next.includes('NEXT LISTED SPEAKING SESSION'));assert(next.includes('10:30a–12:00p'));const room=await p.evaluate(()=>Guide.events.find(e=>e.people.some(p=>p.name==='Trevor Lanting')).room);assert(next.includes(room));
 await p.locator('.ins-next button').click();assert((await p.locator('#sheet-title').innerText()).includes('HPC–Quantum Integration'));await p.locator('#close-sheet').click();
 await profile('Hanhee Paik');assert.equal(await p.locator('.ins-next').count(),0);
 await profile('M. Fernando Gonzalez-Zalba');const window=await p.locator('.ins-next').innerText();assert(window.includes('DISPLAY WINDOW OPEN')&&window.includes('Author attendance unconfirmed'));
 await p.clock.setFixedTime(new Date('2026-11-19T17:15:00Z'));await profile('Trevor Lanting');assert((await p.locator('.ins-next').innerText()).includes('SPEAKING SESSION IN PROGRESS'));
 await p.clock.setFixedTime(new Date('2026-11-19T18:00:00Z'));await profile('Trevor Lanting');assert.equal(await p.locator('.ins-next').count(),0);
 console.log(JSON.stringify({next,poster:window,liveAndEnded:true}));await b.close();
})().catch(e=>{console.error(e);process.exit(1)});
