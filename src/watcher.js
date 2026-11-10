'use strict';
const { EventEmitter } = require('node:events');
const { parseArticlePage, parsePushes } = require('./ptt');
const { pttGet } = require('./http');

const LONGPOLL_TIMEOUT_MS = 12000;   // 連線掛著等新推文的最長時間,逾時就主動再問一次
const MIN_LOOP_INTERVAL_MS = 1000;   // 和 PTT 網頁版一樣,每輪至少間隔 1 秒
const MAX_BACKOFF_MS = 30000;
const REINIT_AFTER_FAILURES = 6;     // 連續失敗這麼多次就整篇重新載入

class FatalError extends Error {}

/**
 * 追蹤一篇 PTT 文章的新推文。
 * 用的是 PTT 網頁版自己的「推文自動更新」機制(long poll),不需要登入。
 *
 * 事件:
 *   'comments' (pushes[], { backlog })  新推文;backlog=true 表示剛加入時的最近幾則
 *   'state'    ({ state, message })     connecting | live | retrying | error
 *   'title'    (title)
 */
class ArticleWatcher extends EventEmitter {
  constructor({ url, board, aid, backlog = 5, get = pttGet, sleep } = {}) {
    super();
    this.url = url;
    this.board = board;
    this.aid = aid;
    this.backlog = backlog;
    this.title = '';
    this.count = 0;
    this.state = 'connecting';
    this.message = '';
    this._get = get;
    this._sleep = sleep || ((ms, signal) => new Promise((resolve) => {
      const t = setTimeout(resolve, ms);
      if (signal) signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
    }));
    this._abort = new AbortController();
    this._running = false;
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._run().catch((err) => {
      if (!this._abort.signal.aborted) this._setState('error', err.message || String(err));
    });
  }

  stop() {
    this._running = false;
    this._abort.abort();
  }

  _setState(state, message = '') {
    if (this.state === state && this.message === message) return;
    this.state = state;
    this.message = message;
    this.emit('state', { state, message });
  }

  get _stopped() { return this._abort.signal.aborted; }

  async _run() {
    let firstLoad = true;
    while (!this._stopped) {
      let follow;
      try {
        follow = await this._load(firstLoad);
      } catch (err) {
        if (this._stopped) return;
        if (err instanceof FatalError) { this._setState('error', err.message); return; }
        throw err;
      }
      if (!follow) return;
      firstLoad = false;
      this._setState('live');
      await this._follow(follow); // 只有需要整篇重新載入時才會回來
    }
  }

  /** 載入文章頁並追到最新。回傳 long poll 所需的狀態。 */
  async _load(emitBacklog) {
    let failures = 0;
    for (;;) {
      if (this._stopped) return null;
      try {
        const res = await this._get(this.url, { signal: this._abort.signal });
        if (res.status === 404) throw new FatalError('文章不存在或已被刪除');
        if (res.status !== 200) throw new Error(`PTT 回應 ${res.status}`);
        const page = parseArticlePage(res.text);
        if (page.title && page.title !== this.title) {
          this.title = page.title;
          this.emit('title', this.title);
        }
        if (!page.poll) throw new FatalError('這篇文章不支援即時更新(可能是太舊的文章)');

        const follow = {
          pollUrl: page.poll.pollUrl,
          longPollUrl: page.poll.longPollUrl,
          size: page.poll.offset,
          lastModified: null,
          etag: null,
        };
        // 文章頁本身有快取,先用 long poll 把頁面之後的推文補齊
        const lp = await this._longPoll(follow);
        const caught = lp && lp.size > follow.size ? await this._fetchNew(follow, lp) : [];
        if (emitBacklog) {
          const all = page.pushes.concat(caught);
          this.count = all.length;
          const recent = this.backlog > 0 ? all.slice(-this.backlog) : [];
          if (recent.length) this.emit('comments', recent, { backlog: true });
        } else if (caught.length) {
          this.count += caught.length;
          this.emit('comments', caught, { backlog: false });
        }
        return follow;
      } catch (err) {
        if (this._stopped) return null;
        if (err instanceof FatalError) throw err;
        failures += 1;
        this._setState(failures >= 2 ? 'retrying' : this.state,
          `連線 PTT 失敗,重試中…(${err.message})`);
        await this._sleep(backoff(failures), this._abort.signal);
      }
    }
  }

  /** 持續 long poll;回傳表示需要整篇重新載入。 */
  async _follow(follow) {
    let failures = 0;
    while (!this._stopped) {
      const started = Date.now();
      try {
        const lp = await this._longPoll(follow);
        if (lp && lp.size > follow.size) {
          const pushes = await this._fetchNew(follow, lp);
          if (pushes.length) {
            this.count += pushes.length;
            this.emit('comments', pushes, { backlog: false });
          }
        }
        failures = 0;
        this._setState('live');
      } catch (err) {
        if (this._stopped) return;
        failures += 1;
        if (failures >= REINIT_AFTER_FAILURES) return;
        if (failures >= 2) this._setState('retrying', `連線不穩,重試中…(${err.message})`);
        await this._sleep(backoff(failures), this._abort.signal);
        continue;
      }
      const wait = MIN_LOOP_INTERVAL_MS - (Date.now() - started);
      if (wait > 0) await this._sleep(wait, this._abort.signal);
    }
  }

  /** 問伺服器目前文章大小。沒有變動(304 或逾時)回傳 null。 */
  async _longPoll(follow) {
    const headers = {};
    if (follow.lastModified) {
      // 兩個標頭要一起送,伺服器才會把連線掛著等;少了 If-None-Match 會回 400
      headers['If-Modified-Since'] = follow.lastModified;
      headers['If-None-Match'] = follow.etag || '0';
    }
    let res;
    try {
      res = await this._get(follow.longPollUrl, {
        headers, timeoutMs: LONGPOLL_TIMEOUT_MS, signal: this._abort.signal,
      });
    } catch (err) {
      // 伺服器把連線掛到逾時通常代表這段時間沒有新推文。但實測偶爾會漏通知,
      // 所以下一輪改成不帶條件直接問目前大小,確保最慢十幾秒內一定追上。
      if (!this._stopped && err && err.name === 'TimeoutError') {
        follow.lastModified = null;
        return null;
      }
      throw err;
    }
    if (res.status === 304) return null;
    if (res.status !== 200) throw new Error(`PTT 回應 ${res.status}`);
    let data;
    try { data = JSON.parse(res.text); } catch { throw new Error('PTT 回應格式錯誤'); }
    if (typeof data.size !== 'number') throw new Error('PTT 回應格式錯誤');
    follow.lastModified = res.headers.get('last-modified') || follow.lastModified;
    follow.etag = res.headers.get('etag') || follow.etag;
    return data;
  }

  /** 取回 follow.size 之後到 lp.size 的新推文。 */
  async _fetchNew(follow, lp) {
    const url = `${follow.pollUrl}&size=${encodeURIComponent(String(lp.size))}` +
      `&size-sig=${encodeURIComponent(lp.sig)}`;
    const res = await this._get(url, { signal: this._abort.signal });
    if (res.status !== 200) throw new Error(`PTT 回應 ${res.status}`);
    let data;
    try { data = JSON.parse(res.text); } catch { throw new Error('PTT 回應格式錯誤'); }
    if (!data.success) {
      // 原文被修改過:和網頁版一樣,從目前結尾重新開始跟隨
      const q = follow.pollUrl.indexOf('?');
      if (!lp.cacheKey || q < 0) throw new Error('無法取得新推文');
      follow.pollUrl = `${follow.pollUrl.slice(0, q)}?cacheKey=${encodeURIComponent(lp.cacheKey)}` +
        `&offset=${encodeURIComponent(String(lp.size))}&offset-sig=${encodeURIComponent(lp.sig)}`;
      follow.size = lp.size;
      return [];
    }
    if (data.pollUrl) follow.pollUrl = data.pollUrl;
    follow.size = lp.size;
    return parsePushes(data.contentHtml);
  }
}

function backoff(failures) {
  return Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(failures, 5));
}

module.exports = { ArticleWatcher, FatalError, backoff };
