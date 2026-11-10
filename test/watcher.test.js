'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ArticleWatcher, backoff } = require('../src/watcher');

const push = (user, text) =>
  `<div class="push"><span class="hl push-tag">推 </span><span class="f3 hl push-userid">${user}</span>` +
  `<span class="f3 push-content">: ${text}</span><span class="push-ipdatetime"> 11/10 16:10\n</span></div>`;

const page = (pushes, offset = 100) => `<meta property="og:title" content="[LIVE] 測試">${pushes.join('')}` +
  `<div id="article-polling" data-pollurl="/poll/T/M.1.A.ABC.html?cacheKey=k&amp;offset=${offset}&amp;offset-sig=s0" ` +
  `data-longpollurl="/v1/longpoll?id=x" data-offset="${offset}"></div>`;

const res = (status, text = '', headers = {}) => ({ status, text, headers: new Map(Object.entries(headers)) });
const lp = (size, lm = 'LM1') => res(200, JSON.stringify({ size, sig: `sig${size}`, cacheKey: 'k2' }), { 'last-modified': lm });
const poll = (pushes, next = '/poll/T/M.1.A.ABC.html?cacheKey=k&offset=N&offset-sig=sN') =>
  res(200, JSON.stringify({ success: true, contentHtml: pushes.join(''), pollUrl: next }));

/** 依序回應的假 PTT;腳本用完之後所有請求都掛著直到被中止。 */
function fakeGet(script) {
  const calls = [];
  const get = (url, opts = {}) => {
    calls.push({ url, headers: opts.headers || {} });
    const step = script.shift();
    if (!step) {
      return new Promise((_resolve, reject) => {
        opts.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    }
    return step instanceof Error ? Promise.reject(step) : Promise.resolve(step);
  };
  return { get, calls };
}

function watch(script, extra = {}) {
  const { get, calls } = fakeGet(script);
  const w = new ArticleWatcher({
    url: 'https://www.ptt.cc/bbs/T/M.1.A.ABC.html', board: 'T', aid: 'M.1.A.ABC',
    get, sleep: () => Promise.resolve(), ...extra,
  });
  const events = [];
  w.on('comments', (list, meta) => events.push({ users: list.map((p) => p.user), backlog: meta.backlog }));
  w.on('state', (s) => events.push({ state: s.state, message: s.message }));
  return { w, calls, events };
}

const settle = () => new Promise((r) => setTimeout(r, 20));

test('emits the most recent pushes as backlog, including ones newer than the cached page', async () => {
  const { w, calls, events } = watch([
    res(200, page([push('a', '1'), push('b', '2'), push('c', '3')])),
    lp(300),
    poll([push('d', '4'), push('e', '5')]),
  ], { backlog: 3 });
  w.start();
  await settle();
  w.stop();
  assert.deepEqual(events[0], { users: ['c', 'd', 'e'], backlog: true });
  assert.deepEqual(events[1], { state: 'live', message: '' });
  assert.equal(w.count, 5);
  assert.equal(w.title, '[LIVE] 測試');
  assert.equal(calls[2].url, '/poll/T/M.1.A.ABC.html?cacheKey=k&offset=100&offset-sig=s0&size=300&size-sig=sig300');
});

test('follows new pushes with conditional long-poll headers', async () => {
  const { w, calls, events } = watch([
    res(200, page([push('a', '1')])),
    lp(100),                       // 頁面已是最新
    lp(200, 'LM2'),
    poll([push('b', '2')], '/poll/next?cacheKey=k&offset=200&offset-sig=s2'),
    lp(260, 'LM3'),
    poll([push('c', '3'), push('d', '4')]),
  ]);
  w.start();
  await settle();
  w.stop();
  assert.deepEqual(events.filter((e) => e.users), [
    { users: ['a'], backlog: true },
    { users: ['b'], backlog: false },
    { users: ['c', 'd'], backlog: false },
  ]);
  assert.equal(w.count, 4);
  assert.deepEqual(calls[1].headers, {}, '第一次 long poll 不帶條件');
  assert.deepEqual(calls[2].headers, { 'If-Modified-Since': 'LM1', 'If-None-Match': '0' });
  assert.deepEqual(calls[4].headers, { 'If-Modified-Since': 'LM2', 'If-None-Match': '0' });
  assert.equal(calls[5].url, '/poll/next?cacheKey=k&offset=200&offset-sig=s2&size=260&size-sig=sig260');
});

test('backlog 0 restores silently', async () => {
  const { w, events } = watch([res(200, page([push('a', '1')])), lp(100)], { backlog: 0 });
  w.start();
  await settle();
  w.stop();
  assert.deepEqual(events, [{ state: 'live', message: '' }]);
  assert.equal(w.count, 1);
});

test('a deleted article is a permanent error', async () => {
  const { w, events, calls } = watch([res(404)]);
  w.start();
  await settle();
  assert.deepEqual(events, [{ state: 'error', message: '文章不存在或已被刪除' }]);
  assert.equal(calls.length, 1);
});

test('an article without polling support is a permanent error', async () => {
  const { w } = watch([res(200, '<title>舊文 - 看板 T - 批踢踢實業坊</title>')]);
  w.start();
  await settle();
  assert.equal(w.state, 'error');
  assert.match(w.message, /不支援即時更新/);
});

test('retries the first load after server errors and network failures', async () => {
  const { w, events } = watch([
    res(525), new Error('ECONNRESET'), res(200, page([push('a', '1')])), lp(100),
  ]);
  w.start();
  await settle();
  w.stop();
  assert.equal(events.filter((e) => e.state === 'retrying').length, 1);
  assert.equal(events.at(-1).state, 'live');
  assert.deepEqual(events.find((e) => e.users), { users: ['a'], backlog: true });
});

test('recovers from transient long-poll failures without losing pushes', async () => {
  const { w, events } = watch([
    res(200, page([])), lp(100),
    res(520), res(525),            // 連續兩次失敗 → retrying
    lp(200, 'LM2'), poll([push('z', 'hi')]),
  ]);
  w.start();
  await settle();
  w.stop();
  assert.deepEqual(events.map((e) => e.state || e.users), ['live', 'retrying', ['z'], 'live']);
});

test('a long-poll timeout falls back to an unconditional check', async () => {
  const timeout = Object.assign(new Error('連線逾時'), { name: 'TimeoutError' });
  const { w, calls, events } = watch([
    res(200, page([])), lp(100), timeout, lp(200, 'LM2'), poll([push('late', 'x')]),
  ]);
  w.start();
  await settle();
  w.stop();
  assert.deepEqual(calls[2].headers, { 'If-Modified-Since': 'LM1', 'If-None-Match': '0' });
  assert.deepEqual(calls[3].headers, {});
  assert.deepEqual(events.find((e) => e.users), { users: ['late'], backlog: false });
  assert.ok(!events.some((e) => e.state === 'retrying'));
});

test('re-follows from the end when the article was edited', async () => {
  const { w, calls, events } = watch([
    res(200, page([])), lp(100),
    lp(500, 'LM2'), res(200, JSON.stringify({ success: false })),
    lp(600, 'LM3'), poll([push('after', 'edit')]),
  ]);
  w.start();
  await settle();
  w.stop();
  assert.equal(calls[5].url, '/poll/T/M.1.A.ABC.html?cacheKey=k2&offset=500&offset-sig=sig500&size=600&size-sig=sig600');
  assert.deepEqual(events.find((e) => e.users), { users: ['after'], backlog: false });
});

test('reloads the whole article after repeated failures', async () => {
  const fails = Array.from({ length: 6 }, () => res(520));
  const { w, calls, events } = watch([
    res(200, page([push('a', '1')])), lp(100),
    ...fails,
    res(200, page([push('a', '1')], 100)), lp(200), poll([push('b', '2')]),
  ]);
  w.start();
  await settle();
  w.stop();
  assert.equal(calls[8].url, 'https://www.ptt.cc/bbs/T/M.1.A.ABC.html');
  assert.deepEqual(events.filter((e) => e.users), [
    { users: ['a'], backlog: true }, { users: ['b'], backlog: false },
  ]);
  assert.equal(w.count, 2);
});

test('stop() ends the loop quietly', async () => {
  const { w, calls, events } = watch([res(200, page([])), lp(100)]);
  w.start();
  await settle();
  const before = calls.length;
  w.stop();
  await settle();
  assert.equal(calls.length, before);
  assert.equal(events.at(-1).state, 'live');
});

test('backoff grows and is capped', () => {
  assert.equal(backoff(1), 2000);
  assert.equal(backoff(3), 8000);
  assert.equal(backoff(50), 30000);
});
