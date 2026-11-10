'use strict';
const { EventEmitter } = require('node:events');
const { parseArticleUrl, parseBoardIndex } = require('./ptt');
const { pttGet } = require('./http');
const { ArticleWatcher } = require('./watcher');

const PALETTE = ['#4fc3f7', '#ffb74d', '#aed581', '#f06292', '#ba68c8', '#fff176', '#4db6ac', '#ff8a65'];
const MAX_ARTICLES = 8;

/**
 * 管理所有追蹤中的文章。
 * 事件:
 *   'comment'  ({ url, board, title, color, tag, user, content, time, backlog })
 *   'articles' (list)  清單或任何一篇的狀態有變
 */
class WatchManager extends EventEmitter {
  constructor({ createWatcher = (opts) => new ArticleWatcher(opts), get = pttGet } = {}) {
    super();
    this._createWatcher = createWatcher;
    this._get = get;
    this._items = new Map(); // url -> { watcher, color }
  }

  list() {
    return [...this._items.entries()].map(([url, { watcher, color }]) => ({
      url,
      board: watcher.board,
      title: watcher.title,
      color,
      state: watcher.state,
      message: watcher.message,
      count: watcher.count,
    }));
  }

  urls() { return [...this._items.keys()]; }

  /** 加入一篇文章。回傳 { ok, error?, url? }。 */
  add(input, { backlog = 5 } = {}) {
    const art = parseArticleUrl(input);
    if (!art) return { ok: false, error: '看不懂這個網址。請貼上 www.ptt.cc 的文章網址。' };
    if (this._items.has(art.url)) return { ok: false, error: '這篇文章已經在追蹤清單裡了。', url: art.url };
    if (this._items.size >= MAX_ARTICLES) {
      return { ok: false, error: `最多同時追蹤 ${MAX_ARTICLES} 篇,請先移除不看的文章。` };
    }
    const used = new Set([...this._items.values()].map((i) => i.color));
    const color = PALETTE.find((c) => !used.has(c)) || PALETTE[this._items.size % PALETTE.length];
    const watcher = this._createWatcher({ ...art, backlog });
    this._items.set(art.url, { watcher, color });

    const changed = () => this.emit('articles', this.list());
    watcher.on('state', changed);
    watcher.on('title', changed);
    watcher.on('comments', (pushes, { backlog: isBacklog }) => {
      for (const p of pushes) {
        this.emit('comment', {
          url: art.url, board: art.board, title: watcher.title, color,
          tag: p.tag, user: p.user, content: p.content, time: p.time, backlog: isBacklog,
        });
      }
      changed();
    });
    watcher.start();
    changed();
    return { ok: true, url: art.url };
  }

  remove(url) {
    const item = this._items.get(url);
    if (!item) return false;
    item.watcher.stop();
    item.watcher.removeAllListeners();
    this._items.delete(url);
    this.emit('articles', this.list());
    return true;
  }

  stopAll() {
    for (const { watcher } of this._items.values()) watcher.stop();
  }

  /** 讀取看板最新的文章列表。 */
  async listBoard(board) {
    let res;
    try {
      res = await this._get(`/bbs/${encodeURIComponent(board)}/index.html`);
    } catch (err) {
      return { ok: false, error: `連不上 PTT(${err.message}),請檢查網路後再試。` };
    }
    if (res.status === 404) return { ok: false, error: `找不到看板「${board}」,請確認名稱。` };
    if (res.status !== 200) return { ok: false, error: `PTT 暫時沒有回應(${res.status}),請稍後再試。` };
    const items = parseBoardIndex(res.text);
    if (!items.length) return { ok: false, error: `看板「${board}」目前沒有可讀取的文章。` };
    return { ok: true, board: items[0].board, items };
  }
}

module.exports = { WatchManager, PALETTE, MAX_ARTICLES };
