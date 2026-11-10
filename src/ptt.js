'use strict';
// PTT 網頁版(www.ptt.cc)的解析工具。全部是純函式,方便測試。

const BASE = 'https://www.ptt.cc';

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x'
        ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code) : whole;
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named === undefined ? whole : named;
  });
}

function stripTags(s) {
  return decodeEntities(String(s).replace(/<[^>]*>/g, ''));
}

/** 從使用者貼上的字串找出文章;認不出來回傳 null。 */
function parseArticleUrl(input) {
  const m = String(input || '').match(
    /(?:^|[/\s])bbs\/([A-Za-z0-9_-]+)\/([MG]\.\d+\.A\.[0-9A-Fa-f]{3})(?:\.html)?/);
  if (!m) return null;
  const board = m[1];
  const aid = m[2].replace(/[0-9a-f]{3}$/, (x) => x.toUpperCase());
  return { board, aid, url: `${BASE}/bbs/${board}/${aid}.html` };
}

/** 使用者輸入的是看板名稱(或看板網址)時回傳看板名,否則 null。 */
function parseBoardName(input) {
  const s = String(input || '').trim();
  if (parseArticleUrl(s)) return null;
  const fromUrl = s.match(/(?:^|\/)bbs\/([A-Za-z0-9_-]+)(?:\/(?:index\d*\.html)?)?\/?(?:[?#].*)?$/);
  if (fromUrl) return fromUrl[1];
  return /^[A-Za-z0-9_-]{2,24}$/.test(s) ? s : null;
}

const PUSH_RE = new RegExp(
  '<div class="push">\\s*' +
  '<span class="[^"]*push-tag[^"]*">([^<]*)</span>\\s*' +
  '<span class="[^"]*push-userid[^"]*">([^<]*)</span>\\s*' +
  '<span class="[^"]*push-content[^"]*">([\\s\\S]*?)</span>\\s*' +
  '<span class="push-ipdatetime">([^<]*)</span>', 'g');

/** 解析一段 HTML 裡的所有推文。 */
function parsePushes(html) {
  const out = [];
  for (const m of String(html || '').matchAll(PUSH_RE)) {
    const rawTag = decodeEntities(m[1]).trim();
    const tag = rawTag === '推' || rawTag === '噓' ? rawTag : '→';
    const time = (m[4].match(/\d{2}\/\d{2}(?: \d{2}:\d{2})?/) || [''])[0];
    out.push({
      tag,
      user: decodeEntities(m[2]).trim(),
      content: stripTags(m[3]).replace(/^\s*:\s?/, '').trim(),
      time,
    });
  }
  return out;
}

/** 解析文章頁:標題、既有推文,以及即時更新(push stream)所需的參數。 */
function parseArticlePage(html) {
  html = String(html || '');
  const og = html.match(/<meta property="og:title" content="([^"]*)"/);
  const titleTag = html.match(/<title>([^<]*)<\/title>/);
  let title = og ? decodeEntities(og[1]) : '';
  if (!title && titleTag) title = decodeEntities(titleTag[1]).replace(/\s*-\s*看板.*$/, '');

  const pollUrl = html.match(/data-pollurl="([^"]+)"/);
  const longPollUrl = html.match(/data-longpollurl="([^"]+)"/);
  const offset = html.match(/data-offset="(\d+)"/);
  const poll = pollUrl && longPollUrl && offset ? {
    pollUrl: decodeEntities(pollUrl[1]),
    longPollUrl: decodeEntities(longPollUrl[1]),
    offset: Number(offset[1]),
  } : null;

  return { title: title.trim(), pushes: parsePushes(html), poll };
}

/** 解析看板文章列表,新的在前;置底文排在最後。 */
function parseBoardIndex(html) {
  html = String(html || '');
  const sep = html.indexOf('r-list-sep');
  const normal = [];
  const pinned = [];
  const re = /<div class="r-ent">([\s\S]*?)<div class="mark">/g;
  for (const m of html.matchAll(re)) {
    const chunk = m[1];
    const link = chunk.match(/<div class="title">\s*<a href="([^"]+)">([^<]*)<\/a>/);
    if (!link) continue; // 已被刪除的文章沒有連結
    const art = parseArticleUrl(decodeEntities(link[1]));
    if (!art) continue;
    const nrec = chunk.match(/<div class="nrec">(?:<span[^>]*>([^<]*)<\/span>)?/);
    const author = chunk.match(/<div class="author">([^<]*)<\/div>/);
    const date = chunk.match(/<div class="date">([^<]*)<\/div>/);
    const item = {
      url: art.url,
      board: art.board,
      aid: art.aid,
      title: decodeEntities(link[2]).trim(),
      nrec: nrec && nrec[1] ? decodeEntities(nrec[1]).trim() : '',
      author: author ? decodeEntities(author[1]).trim() : '',
      date: date ? date[1].trim() : '',
      pinned: sep >= 0 && m.index > sep,
    };
    (item.pinned ? pinned : normal).push(item);
  }
  return [...normal.reverse(), ...pinned];
}

module.exports = {
  BASE, decodeEntities, stripTags, parseArticleUrl, parseBoardName,
  parsePushes, parseArticlePage, parseBoardIndex,
};
