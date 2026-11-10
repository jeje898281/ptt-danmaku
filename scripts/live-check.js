#!/usr/bin/env node
'use strict';
// 對真實的 PTT 做一次端到端檢查:找一篇正在被推文的文章,追蹤一段時間。
// 用法: node scripts/live-check.js [看板或文章網址] [秒數]
const { pttGet } = require('../src/http');
const { parseBoardIndex, parseArticleUrl, parseBoardName } = require('../src/ptt');
const { ArticleWatcher } = require('../src/watcher');

async function main() {
  const target = process.argv[2] || 'Gossiping';
  const seconds = Number(process.argv[3] || 40);
  let art = parseArticleUrl(target);
  if (!art) {
    const board = parseBoardName(target);
    const res = await pttGet(`/bbs/${board}/index.html`);
    if (res.status !== 200) throw new Error(`看板 ${board} 回應 ${res.status}`);
    const items = parseBoardIndex(res.text).filter((i) => !i.pinned);
    console.log(`看板 ${board}:${items.length} 篇`);
    const hot = items.find((i) => i.nrec) || items[0];
    art = parseArticleUrl(hot.url);
    console.log(`追蹤:${hot.title} (${hot.nrec || 0})`);
  }
  const t0 = Date.now();
  const el = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(5);
  const w = new ArticleWatcher(art);
  let live = 0;
  let backlog = 0;
  w.on('title', (t) => console.log(el(), '標題', t));
  w.on('state', (s) => console.log(el(), '狀態', s.state, s.message));
  w.on('comments', (list, meta) => {
    if (meta.backlog) backlog += list.length; else live += list.length;
    for (const c of list) console.log(el(), meta.backlog ? '[舊]' : '[新]', c.tag, c.user, c.content, `(${c.time})`);
  });
  w.start();
  await new Promise((r) => setTimeout(r, seconds * 1000));
  w.stop();
  console.log(`結果:狀態=${w.state} 總推文=${w.count} 回顧=${backlog} 即時=${live}`);
  process.exit(w.state === 'live' ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
