'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  decodeEntities, parseArticleUrl, parseBoardName, parsePushes, parseArticlePage, parseBoardIndex,
} = require('../src/ptt');

const PUSH = (tag, cls, user, content, when) =>
  `<div class="push"><span class="${cls} push-tag">${tag} </span>` +
  `<span class="f3 hl push-userid">${user}</span>` +
  `<span class="f3 push-content">: ${content}</span>` +
  `<span class="push-ipdatetime"> ${when}\n</span></div>`;

test('decodeEntities handles named and numeric entities', () => {
  assert.equal(decodeEntities('a &amp; b &lt;c&gt; &#34;d&#34; &#x4e2d; &unknown;'), 'a & b <c> "d" 中 &unknown;');
});

test('parseArticleUrl accepts the common ways people paste a link', () => {
  const want = { board: 'Tennis', aid: 'M.1793941002.A.E50', url: 'https://www.ptt.cc/bbs/Tennis/M.1793941002.A.E50.html' };
  for (const input of [
    'https://www.ptt.cc/bbs/Tennis/M.1793941002.A.E50.html',
    '  http://ptt.cc/bbs/Tennis/M.1793941002.A.E50.html?utm=1#x ',
    'www.ptt.cc/bbs/Tennis/M.1793941002.A.e50.html',
    '/bbs/Tennis/M.1793941002.A.E50',
    '看這篇 https://www.ptt.cc/bbs/Tennis/M.1793941002.A.E50.html 好笑',
  ]) assert.deepEqual(parseArticleUrl(input), want, input);
});

test('parseArticleUrl rejects things that are not articles', () => {
  for (const input of ['', null, 'Tennis', 'https://www.ptt.cc/bbs/Tennis/index.html', 'https://example.com/a/b']) {
    assert.equal(parseArticleUrl(input), null, String(input));
  }
});

test('parseBoardName accepts board names and board URLs only', () => {
  assert.equal(parseBoardName('Tennis'), 'Tennis');
  assert.equal(parseBoardName(' C_Chat '), 'C_Chat');
  assert.equal(parseBoardName('https://www.ptt.cc/bbs/NBA/index.html'), 'NBA');
  assert.equal(parseBoardName('https://www.ptt.cc/bbs/NBA/'), 'NBA');
  assert.equal(parseBoardName('https://www.ptt.cc/bbs/NBA/M.1.A.ABC.html'), null);
  assert.equal(parseBoardName('網球板'), null);
  assert.equal(parseBoardName('a'), null);
});

test('parsePushes extracts tag, user, content and time', () => {
  const html = PUSH('推', 'hl', 'polanco', '人真的會越來越少', '114.39.44.183 11/09 19:09') +
    PUSH('噓', 'f1 hl', 'boo_er    ', 'A &amp; B &lt;3', '11/10 16:10') +
    PUSH('→', 'f1 hl', 'linker', '<a href="https://i.imgur.com/x.jpeg" target="_blank" rel="noreferrer">https://i.imgur.com/x.jpeg</a>', '11/10 16:21');
  assert.deepEqual(parsePushes(html), [
    { tag: '推', user: 'polanco', content: '人真的會越來越少', time: '11/09 19:09' },
    { tag: '噓', user: 'boo_er', content: 'A & B <3', time: '11/10 16:10' },
    { tag: '→', user: 'linker', content: 'https://i.imgur.com/x.jpeg', time: '11/10 16:21' },
  ]);
  assert.deepEqual(parsePushes('<div>沒有推文</div>'), []);
});

test('parseArticlePage reads title, pushes and polling parameters', () => {
  const html = '<html><head><meta property="og:title" content="[LIVE] A &amp; B 決賽">' +
    '<title>[LIVE] A &amp; B 決賽 - 看板 Tennis - 批踢踢實業坊</title></head><body>' +
    PUSH('推', 'hl', 'u1', 'hi', '11/10 16:10') +
    '<div id="article-polling" data-pollurl="/poll/Tennis/M.1.A.ABC.html?cacheKey=1-2&amp;offset=461&amp;offset-sig=abc" ' +
    'data-longpollurl="/v1/longpoll?id=deadbeef" data-offset="461"></div></body></html>';
  const page = parseArticlePage(html);
  assert.equal(page.title, '[LIVE] A & B 決賽');
  assert.equal(page.pushes.length, 1);
  assert.deepEqual(page.poll, {
    pollUrl: '/poll/Tennis/M.1.A.ABC.html?cacheKey=1-2&offset=461&offset-sig=abc',
    longPollUrl: '/v1/longpoll?id=deadbeef',
    offset: 461,
  });
});

test('parseArticlePage reports missing polling support', () => {
  const page = parseArticlePage('<title>舊文章 - 看板 Old - 批踢踢實業坊</title>');
  assert.equal(page.title, '舊文章');
  assert.equal(page.poll, null);
});

test('parseBoardIndex lists newest first, pinned last, and skips deleted posts', () => {
  const ent = (nrec, href, title, author, date) => `<div class="r-ent">
    <div class="nrec">${nrec}</div>
    <div class="title">${href ? `<a href="${href}">${title}</a>` : title}</div>
    <div class="meta"><div class="author">${author}</div>
      <div class="article-menu"><div class="item"><a href="/bbs/Tennis/search?q=x">搜尋</a></div></div>
      <div class="date">${date}</div><div class="mark"></div></div></div>`;
  const html = ent('<span class="hl f3">14</span>', '/bbs/Tennis/M.1793941002.A.E50.html', '[新聞] 舊的', 'a1', '11/06') +
    ent('', '', '(本文已被刪除) [x]', '-', '11/07') +
    ent('<span class="hl f1">爆</span>', '/bbs/Tennis/M.1793986403.A.15A.html', '[LIVE] 新的 &#34;決賽&#34;', 'a2', '11/07') +
    '<div class="r-list-sep"></div>' +
    ent('', '/bbs/Tennis/M.1700000000.A.000.html', '[公告] 板規', 'mod', ' 1/01');
  const items = parseBoardIndex(html);
  assert.deepEqual(items.map((i) => [i.title, i.nrec, i.pinned]), [
    ['[LIVE] 新的 "決賽"', '爆', false],
    ['[新聞] 舊的', '14', false],
    ['[公告] 板規', '', true],
  ]);
  assert.equal(items[0].url, 'https://www.ptt.cc/bbs/Tennis/M.1793986403.A.15A.html');
  assert.equal(items[0].author, 'a2');
  assert.equal(items[2].date, '1/01');
});
