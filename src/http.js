'use strict';
const { BASE } = require('./ptt');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

class HttpError extends Error {
  constructor(status, url) {
    super(`HTTP ${status}`);
    this.status = status;
    this.url = url;
  }
}

/**
 * 對 www.ptt.cc 發 GET。回傳 { status, text, headers }。
 * 逾時或被 signal 中止會丟出例外;HTTP 錯誤碼不會丟(由呼叫端判斷)。
 */
async function pttGet(pathOrUrl, { headers = {}, timeoutMs = 15000, signal, fetchImpl = fetch } = {}) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : BASE + pathOrUrl;
  const timer = new AbortController();
  const onAbort = () => timer.abort();
  if (signal) {
    if (signal.aborted) timer.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  let timedOut = false;
  const handle = setTimeout(() => { timedOut = true; timer.abort(); }, timeoutMs);
  try {
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': USER_AGENT, Cookie: 'over18=1', ...headers },
      signal: timer.signal,
      redirect: 'follow',
    });
    const text = await res.text();
    return { status: res.status, text, headers: res.headers };
  } catch (err) {
    if (timedOut) {
      const e = new Error('連線逾時');
      e.name = 'TimeoutError';
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(handle);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

module.exports = { pttGet, HttpError, USER_AGENT };
