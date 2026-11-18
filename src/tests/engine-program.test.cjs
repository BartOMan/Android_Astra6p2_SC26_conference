'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../app/engine.js');
const {events} = require('../data/program.json');

test('Each topic produces only compatible appointments across all published days and room buffers', () => {
  const days = new Set(events.map(event => event.date));
  let scheduled = 0;
  for (const day of days) {
    for (const {id} of Engine.topics) {
      for (const walkMinutes of [0,5,15]) {
        const plan = Engine.plan(events,{day,interests:[id],walkMinutes});
        assert.equal(plan.conflicts.length,0);
        for (const [i,item] of plan.items.entries()) {
          assert.equal(item.date,day);
          assert.ok(plan.matches[item.id].includes(id));
          assert.equal(Engine.isDropIn(item),false);
          assert.ok(!['Job Posting','Exhibits','Career Fair'].includes(item.format));
          assert.ok(!/^(?:Morning|Afternoon|Lunch|Short) Break$/i.test(item.title));
          if (i > 0) {
            const previous = plan.items[i-1];
            const gap = Engine.minutes(item.start) - Engine.minutes(previous.end);
            assert.ok(gap >= (item.room === previous.room && item.room ? 0 : walkMinutes),
              previous.title + ' conflicts with ' + item.title);
          }
          scheduled++;
        }
        for (const item of plan.dropIns) {
          assert.equal(item.date,day);
          assert.ok(Engine.isDropIn(item));
          assert.ok(plan.matches[item.id].includes(id));
        }
      }
    }
  }
  assert.ok(scheduled > 0);
});

test('SC26 Squid k-mer software does not become a superconducting-device recommendation', () => {
  const software = events.find(item => /^Squid: Distributed-Memory k-mer Counting/.test(item.title));
  assert.ok(software);
  assert.ok(!Engine.classify(software).includes('superconductivity'));
  assert.deepEqual(Engine.plan([software],{keywords:['SQUID']}).items,[]);
  assert.deepEqual(Engine.plan([software],{keywords:['squid']}).items,[software]);
});
