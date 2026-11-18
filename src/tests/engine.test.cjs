'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const Engine = require('../app/engine.js');
const date = '2026-11-18';
const event = (id, title, start, end, room='W183a', extra={}) =>
  ({id, title, date, start, end, room, format:'Paper', kind:'item', topics:[], ...extra});
const ids = results => results.items.map(item => item.id);

test('The conference clock handles midnight and crossing days from UTC', () => {
  assert.deepEqual(Engine.clock(new Date('2026-11-19T05:58:00Z')), {day: date, minute:1438});
  assert.deepEqual(Engine.clock(new Date('2026-11-19T06:00:00Z')), {day:'2026-11-19', minute:0});
});

test('Folding accents still finds contributors and institutions in a local index', () => {
  const data = event('a','Meshing','09:00','09:30','W123', {people:['xyz']});
  const index = Engine.searchText(data, new Map([['xyz',{name:'Sofía Fernández',institutions:['Forschungszentrum Jülich']}]]));
  assert.ok(index.includes('sofia fernandez'));
  assert.ok(index.includes('julich'));
});

test('Official labels and titles outrank incidental mentions; no substring matches for AI', () => {
  const e = event('a','Cryogenic superconducting accelerators','10:00','10:30','W123',
    {topics:['Quantum Computing'],description:'Noise in a domain with storage devices.'});
  assert.equal(Engine.classify(e)[0],'quantum');
  assert.ok(Engine.classify(e).includes('hardware'));
  assert.ok(!Engine.classify(e).includes('ai'));
  assert.deepEqual(Engine.classify(event('b','Chair Introductions','09:00','09:15')),[]);
});

test('Optimizes the whole day over two same-room talks, a parent block and one long alternative', () => {
  const block = event('s','Machine learning', '09:00','10:30','W183a', {kind:'block'});
  const items = [block,
    event('a','Machine learning for graphs','09:00','09:45','W183a',{parentId:'s'}),
    event('b','Machine learning for stars','09:45','10:30','W183a',{parentId:'s'}),
    event('c','Machine learning workshop','09:00','10:00','W180b'),
    event('d','An unrelated presentation','10:30','11:00')];
  assert.deepEqual(ids(Engine.plan(items, {interests:['ai']})),['a','b']);
  assert.deepEqual(Engine.contentItems(items).map(item => item.id),['a','b','c','d']);
  assert.deepEqual(ids(Engine.plan(items, {lockedIds:['s'], interests:['ai']})),['s']);
});

test('Room transfers consume the selected buffer exactly; non-overlapping saved conflicts remain visible', () => {
  const items = [
    event('a','Quantum algorithms','09:00','09:30','A'),
    event('b','Quantum simulators','09:30','10:00','B'),
    event('c','Quantum processors','09:35','10:05','B')];
  assert.deepEqual(ids(Engine.plan(items,{interests:['quantum'],lockedIds:['a'],walkMinutes:5})),['a','c']);
  assert.deepEqual(ids(Engine.plan(items,{interests:['quantum'],lockedIds:['a'],walkMinutes:0})),['a','b']);
  const saved = Engine.plan(items, {lockedIds:['a','b','c']});
  assert.deepEqual(ids(saved), ['a','b','c']);
  assert.deepEqual(saved.conflicts, [
    {a:'a',b:'b',reason:'walk'},{a:'b',b:'c',reason:'overlap'}]);
});

test('Posters can be visited during display hours while a timed finalist talk reserves a slot', () => {
  const poster = event('p','Superconducting circuits', '10:00','17:00','Skyline Ballroom',{format:'Posters',timing:'block'});
  const talk = event('f','Quantum computing', '10:30','10:45','W185d',{format:'Posters',timing:'exact'});
  const missing = event('t','Location details pending','', '', '',{date:''});
  const saved = Engine.plan([poster,talk,missing],{interests:['quantum'],lockedIds:['p','t']});
  assert.deepEqual(ids(saved),['f']);
  assert.deepEqual(saved.unscheduled,[missing]);
  assert.deepEqual(saved.dropIns,[poster]);
  assert.deepEqual(saved.conflicts,[]);
});

test('Day and time windows filter automatic picks, preserve personal commitments and avoid null recommendations', () => {
  const items = [
    event('today','Quantum','08:00','09:00','A'),
    event('later','Quantum','14:00','15:00','B'),
    event('tomorrow','Quantum','14:00','15:00','A',{date:'2026-11-19'})];
  assert.deepEqual(ids(Engine.plan(items,{interests:['quantum'],day:date,after:13*60})),['later']);
  assert.deepEqual(ids(Engine.plan(items,{interests:['quantum'],day:date,after:13*60,lockedIds:['today']})),['today','later']);
  assert.deepEqual(ids(Engine.plan(items,{})),[]);
});

test('After-now poster results include open displays and skip closed displays, including the evening reception', () => {
  const noon = event('noon','Quantum circuits','10:00','17:00','N',{kind:'item',format:'Posters',timing:'block'});
  const evening = event('evening','Superconducting logic','17:15','19:00','N',{kind:'item',format:'Posters',timing:'block'});
  const r = Engine.plan([noon,evening],{day:date,after:18*60,interests:['quantum']});
  assert.deepEqual(r.dropIns,[evening]);
  assert.deepEqual(r.items,[]);
});

test('A job posting never becomes a suggested technical session, and official topic tags stand on their own', () => {
  const job = event('j','GPU accelerator engineer','07:00','08:00','A',{format:'Job Posting'});
  const session = event('s','A new design','09:00','09:30','A',{topics:['Architectures']});
  assert.deepEqual(ids(Engine.plan([job,session],{interests:['hardware']})),['s']);
  assert.deepEqual(ids(Engine.plan([job,session],{interests:['hardware'],lockedIds:['j']})),['j','s']);
});

test('Exhibition windows with individual works never reserve a full day, even when a display is saved', () => {
  const block = event('s','Art of HPC Exhibition','08:00','18:00','A',{kind:'block',format:'Art of HPC',topics:['Art of HPC']});
  const art = event('i','Particle rendering','08:00','18:00','A',{parentId:'s',format:'Art of HPC',dropIn:true});
  const oral = event('v','Data visualization','13:00','13:30','B');
  const automatic = Engine.plan([block,art,oral],{interests:['visual']});
  assert.deepEqual(automatic.dropIns,[art]);
  assert.deepEqual(ids(automatic),['v']);
  assert.ok(Engine.plan([block,art,oral],{interests:['visual'],lockedIds:['s']}).dropIns.includes(block));
});

test('Inherited workshop keywords do not make coffee breaks or welcome messages into technical appointments', () => {
  const create = (id,title,start,end) => event(id,title,start,end,'A',{format:'Workshop',topics:['Algorithms'],topicsInherited:true});
  const items = [create('a','Morning Break','10:00','10:15'), create('b','Opening remarks by ISAV OC','10:15','10:20'), create('c','A Method to Break the Memory Bound','10:20','10:40')];
  assert.deepEqual(ids(Engine.plan(items,{interests:['algorithms']})),['c']);
});

test('The dedicated superconductivity lens needs direct evidence, not just a tokamak or generic quantum hardware', () => {
  for (const title of ['Josephson junction design', 'SQUID measurements', 'SQUIDs at scale',
    'Cryostats for industrial research','RSFQ at higher clock rates','Superconductivity in a hybrid circuit']) {
    assert.ok(Engine.classify(event(title,title,'10:00','10:30')).includes('superconductivity'),title);
  }
  for (const title of ['Tokamak plasma turbulence','Quantum circuits on trapped ions','Risk to mosquito populations']) {
    assert.ok(!Engine.classify(event(title,title,'10:00','10:30')).includes('superconductivity'),title);
  }
});

test('Free-text interests match any whole acronym or phrase, allow scientific plurals and explain matches', () => {
  const items = [
    event('a','SQUIDs for readout','09:00','09:30'),
    event('b','Advanced tensor-networks','09:30','10:00'),
    event('c','A modern compiler for the GPU','10:00','10:30'),
    event('d','An integral tensor solver for networks','10:30','11:00'),
    event('e','A model of tokamak turbulence','11:00','11:30'),
    event('f','Nanotensor networks','11:30','12:00'),
    event('g','Parallel C++ solvers','12:00','12:30'),
    event('h','New MPI implementation','12:30','13:00')
  ];
  const r = Engine.plan(items,{keywords:[' SQUID ','tensor network','tokamak','C++','MPI','squid','.*']});
  assert.deepEqual(ids(r),['a','b','e','g','h']);
  assert.deepEqual(r.keywordMatches.a,['SQUID']);
  assert.deepEqual(r.keywordMatches.b,['tensor network']);
  assert.deepEqual(r.keywordMatches.g,['C++']);
  assert.deepEqual(r.matches.a,[]);
  assert.equal(r.keywordMatches.c,undefined);
});

test('Personal keyword depth ranks titles, official tags and abstracts in order and keeps unrelated pinned events', () => {
  const title = event('z','Superconductivity code','10:00','10:30');
  const tag = event('b','Low temperature devices','10:00','10:30','A',{topics:['Superconductor']});
  const text = event('a','Simulation of material systems','10:00','10:30','A',{description:'Results for a superconducting platform.'});
  const saved = event('s','Unrelated stand-alone session','14:00','15:00');
  const opts = {keywords:['superconduct'],lockedIds:['s']};
  assert.deepEqual(ids(Engine.plan([text,tag,title,saved],opts)),['z','s']);
  assert.deepEqual(ids(Engine.plan([text,tag,saved],opts)),['b','s']);
  assert.deepEqual(ids(Engine.plan([text,saved],opts)),['a','s']);
  assert.deepEqual(Engine.plan([text,saved],opts).keywordMatches.s,[]);
});

test('Topics and free text can independently qualify sessions; off-topic poster collections stay flexible', () => {
  const quantum = event('q','Neutral atom quantum simulation','10:00','10:30');
  const plasma = event('t','Tokamak simulation','10:30','11:00');
  const display = event('p','Benchmark on tokamaks','10:00','17:00','S',{format:'Posters',dropIn:true});
  const r = Engine.plan([quantum,plasma,display],{interests:['quantum'],keywords:['tokamak']});
  assert.deepEqual(ids(r),['q','t']);
  assert.deepEqual(r.dropIns,[display]);
  assert.deepEqual(r.keywordMatches.t,['tokamak']);
});
