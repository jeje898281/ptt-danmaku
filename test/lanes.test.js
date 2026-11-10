'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Lanes = require('../renderer/lanes');

test('laneCount fits lanes into the chosen share of the screen', () => {
  assert.equal(Lanes.laneCount(900, 30, 0.7), 14);
  assert.equal(Lanes.laneCount(100, 72, 0.1), 1, '至少一條');
});

test('pickLane takes the first free lane or reports none', () => {
  assert.equal(Lanes.pickLane([500, 90, 0], 100), 1);
  assert.equal(Lanes.pickLane([500, 600], 100), -1);
});

test('a lane stays busy until the tail has entered the screen', () => {
  assert.equal(Lanes.laneBusyUntil(1000, 340, 170), 1000 + 2000 + Lanes.LANE_GAP_MS);
});

test('shouldShow applies type toggles and blocked words', () => {
  const settings = { showBoo: false, showArrow: true };
  const words = Lanes.parseBlockWords('劇透, Spoiler　簽賭');
  assert.deepEqual(words, ['劇透', 'spoiler', '簽賭']);
  const msg = (tag, content, user = 'u') => ({ tag, content, user });
  assert.equal(Lanes.shouldShow(msg('推', '好球'), settings, words), true);
  assert.equal(Lanes.shouldShow(msg('噓', '爛'), settings, words), false);
  assert.equal(Lanes.shouldShow(msg('→', '嗯'), settings, words), true);
  assert.equal(Lanes.shouldShow(msg('推', '有 SPOILER 喔'), settings, words), false);
  assert.equal(Lanes.shouldShow(msg('推', '正常', 'spoilerbot'), settings, words), false);
  assert.equal(Lanes.shouldShow(msg('推', ''), settings, []), false);
});

test('pushQueue drops the oldest items when flooded', () => {
  const q = [];
  for (let i = 0; i < Lanes.MAX_QUEUE + 5; i++) Lanes.pushQueue(q, i);
  assert.equal(q.length, Lanes.MAX_QUEUE);
  assert.equal(q[0], 5);
});
