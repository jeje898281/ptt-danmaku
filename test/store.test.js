'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store, DEFAULT_SETTINGS, sanitizeSettings } = require('../src/store');

test('sanitizeSettings clamps numbers and ignores unknown or mistyped fields', () => {
  const s = sanitizeSettings({
    fontSize: 999, speed: -5, opacity: '0.5', areaRatio: 'abc',
    showBoo: 'yes', showUser: false, blockWords: 'x'.repeat(900), displayId: '7', hack: 1,
  });
  assert.equal(s.fontSize, 72);
  assert.equal(s.speed, 60);
  assert.equal(s.opacity, 0.5);
  assert.equal(s.areaRatio, DEFAULT_SETTINGS.areaRatio);
  assert.equal(s.showBoo, true);
  assert.equal(s.showUser, false);
  assert.equal(s.blockWords.length, 500);
  assert.equal(s.displayId, 7);
  assert.equal('hack' in s, false);
  assert.equal(sanitizeSettings({ displayId: null }, { ...DEFAULT_SETTINGS, displayId: 3 }).displayId, null);
  assert.deepEqual(sanitizeSettings(null), { ...DEFAULT_SETTINGS });
});

test('sanitizeSettings applies a partial patch on top of current settings', () => {
  const current = { ...DEFAULT_SETTINGS, fontSize: 40, showArrow: false };
  assert.deepEqual(sanitizeSettings({ speed: 200 }, current), { ...current, speed: 200 });
});

test('Store round-trips data and survives a corrupt file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ptt-danmaku-'));
  const file = path.join(dir, 'nested', 'config.json');
  const a = new Store(file);
  assert.deepEqual(a.data.settings, { ...DEFAULT_SETTINGS });
  a.data.settings.fontSize = 44;
  a.data.articles = ['https://www.ptt.cc/bbs/Tennis/M.1.A.ABC.html'];
  a.data.recentBoards = ['Tennis'];
  a.data.overlayVisible = false;
  a.flush();

  const b = new Store(file);
  assert.equal(b.data.settings.fontSize, 44);
  assert.deepEqual(b.data.articles, a.data.articles);
  assert.deepEqual(b.data.recentBoards, ['Tennis']);
  assert.equal(b.data.overlayVisible, false);

  fs.writeFileSync(file, '{ not json');
  const c = new Store(file);
  assert.deepEqual(c.data.settings, { ...DEFAULT_SETTINGS });
  assert.deepEqual(c.data.articles, []);
  fs.rmSync(dir, { recursive: true, force: true });
});
