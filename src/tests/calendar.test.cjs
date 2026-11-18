const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const vm=require('vm');
const {serialize}=require('../app/calendar.js');
test('Time zone rollover, RFC escaping, UTF-8 folding, distinct repeated appearances and availability',()=>{
  const common={title:'界'.repeat(55)+', A; B\\C\nD',room:'Room, A',day:'2026-11-19',start:'19:00',end:'22:00',format:'Reception',people:[]};
  const text=serialize([{...common,id:'one'},{...common,id:'two',dropIn:true}],new Date('2026-11-18T07:30:09Z'));
  assert.ok(text.split('\r\n').every(s=>Buffer.byteLength(s)<=75));
  const unfolded=text.replace(/\r\n /g,'');
  assert.ok(unfolded.includes('DTSTART:20261120T010000Z\r\nDTEND:20261120T040000Z'));
  assert.ok(unfolded.includes('SUMMARY:'+'界'.repeat(55)+'\\, A\\; B\\\\C\\nD'));
  assert.ok(unfolded.includes('TRANSP:TRANSPARENT'));
  assert.ok(unfolded.includes('TRANSP:OPAQUE'));
  assert.deepEqual([...unfolded.matchAll(/UID:([^\r]+)/g)].map(x=>x[1]),['one@sc26-field-guide.local','two@sc26-field-guide.local']);
});
test('Every packaged event serializes with valid UTC date and distinct UID',()=>{
  const context={window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../app/data.js'),'utf8'),context);
  const events=context.window.SC_DATA.events;
  const content=serialize(events).replace(/\r\n /g,'');
  assert.equal([...content.matchAll(/\r\nDTSTART:\d{8}T\d{6}Z\r\n/g)].length,events.length);
  const ids=[...content.matchAll(/\r\nUID:([^\r]+)/g)].map(x=>x[1]);
  assert.equal(new Set(ids).size,events.length);
});
