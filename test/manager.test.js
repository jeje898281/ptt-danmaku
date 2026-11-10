'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { WatchManager, MAX_ARTICLES, PALETTE } = require('../src/manager');

class FakeWatcher extends EventEmitter {
  constructor(opts) { super(); Object.assign(this, opts, { title: '', state: 'connecting', message: '', count: 0 }); }
  start() { this.started = true; }
  stop() { this.stopped = true; }
}

function make(get) {
  const watchers = [];
  const m = new WatchManager({ createWatcher: (o) => { const w = new FakeWatcher(o); watchers.push(w); return w; }, get });
  return { m, watchers };
}
const url = (n) => `https://www.ptt.cc/bbs/Tennis/M.${1000 + n}.A.ABC.html`;

test('add validates input, rejects duplicates and assigns distinct colours', () => {
  const { m, watchers } = make();
  assert.equal(m.add('not a url').ok, false);
  assert.deepEqual(m.add(url(1)), { ok: true, url: url(1) });
  assert.equal(m.add('www.ptt.cc/bbs/Tennis/M.1001.A.abc.html').ok, false, '同一篇換個寫法也算重複');
  m.add(url(2));
  assert.equal(watchers.length, 2);
  assert.ok(watchers.every((w) => w.started));
  const colors = m.list().map((a) => a.color);
  assert.deepEqual(colors, PALETTE.slice(0, 2));
});

test('add enforces the article limit and remove frees a slot and its colour', () => {
  const { m, watchers } = make();
  for (let i = 0; i < MAX_ARTICLES; i++) assert.equal(m.add(url(i)).ok, true);
  assert.match(m.add(url(99)).error, /最多/);
  assert.equal(m.remove(url(0)), true);
  assert.equal(watchers[0].stopped, true);
  assert.equal(m.remove(url(0)), false);
  assert.equal(m.add(url(99)).ok, true);
  assert.equal(m.list().at(-1).color, PALETTE[0]);
});

test('forwards comments with article colour and backlog flag', () => {
  const { m, watchers } = make();
  const got = [];
  const lists = [];
  m.on('comment', (c) => got.push(c));
  m.on('articles', (l) => lists.push(l));
  m.add(url(1));
  watchers[0].title = '[LIVE] 決賽';
  watchers[0].count = 2;
  watchers[0].emit('comments', [
    { tag: '推', user: 'a', content: 'x', time: '11/10 16:10' },
    { tag: '噓', user: 'b', content: 'y', time: '' },
  ], { backlog: true });
  assert.equal(got.length, 2);
  assert.deepEqual(got[0], {
    url: url(1), board: 'Tennis', title: '[LIVE] 決賽', color: PALETTE[0],
    tag: '推', user: 'a', content: 'x', time: '11/10 16:10', backlog: true,
  });
  assert.equal(lists.at(-1)[0].count, 2);
  watchers[0].state = 'live';
  watchers[0].emit('state', { state: 'live', message: '' });
  assert.equal(lists.at(-1)[0].state, 'live');
});

test('listBoard explains failures in plain language', async () => {
  const index = '<div class="r-ent"><div class="nrec"></div><div class="title"><a href="/bbs/Tennis/M.1.A.ABC.html">[LIVE] x</a></div>' +
    '<div class="meta"><div class="author">a</div><div class="date">11/10</div><div class="mark"></div></div></div>';
  const cases = [
    [async () => ({ status: 200, text: index }), (r) => assert.deepEqual([r.ok, r.board, r.items.length], [true, 'Tennis', 1])],
    [async () => ({ status: 404, text: '' }), (r) => assert.match(r.error, /找不到看板/)],
    [async () => ({ status: 525, text: '' }), (r) => assert.match(r.error, /稍後再試/)],
    [async () => ({ status: 200, text: '<html></html>' }), (r) => assert.match(r.error, /沒有可讀取/)],
    [async () => { throw new Error('offline'); }, (r) => assert.match(r.error, /連不上 PTT/)],
  ];
  for (const [get, check] of cases) check(await make(get).m.listBoard('tennis'));
});
