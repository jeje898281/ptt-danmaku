'use strict';
/* global danmaku */
(function () {
  const $ = (id) => document.getElementById(id);
  const DEFAULT_BOARDS = ['Tennis', 'NBA', 'Baseball'];
  const FEED_MAX = 60;
  const STATE_LABEL = {
    connecting: '連線中…',
    live: '即時更新中',
    retrying: '重新連線中…',
    error: '無法追蹤',
  };
  const ARTICLE_RE = /bbs\/[A-Za-z0-9_-]+\/[MG]\.\d+\.A\.[0-9A-Fa-f]{3}/;

  let articles = [];
  let noticeTimer = null;
  let clipUrl = null;
  let dismissedClip = null;

  // ---- 提示訊息 ----
  function notice(kind, text, sticky) {
    const el = $('notice');
    clearTimeout(noticeTimer);
    if (!text) { el.hidden = true; return; }
    el.className = 'notice ' + kind;
    el.textContent = text;
    el.hidden = false;
    if (!sticky) noticeTimer = setTimeout(() => { el.hidden = true; }, 5000);
  }

  // ---- 追蹤清單 ----
  function renderArticles(list) {
    articles = list || [];
    const ul = $('articles');
    ul.textContent = '';
    for (const a of articles) {
      const li = document.createElement('li');

      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = a.color;

      const info = document.createElement('div');
      info.className = 'ainfo';
      const title = document.createElement('a');
      title.className = 'atitle';
      title.href = a.url;
      title.target = '_blank';
      title.textContent = a.title || a.url.replace('https://www.ptt.cc/bbs/', '');
      title.title = '在瀏覽器開啟這篇文章';
      const meta = document.createElement('div');
      meta.className = 'ameta';
      const board = document.createElement('span');
      board.textContent = a.board;
      const state = document.createElement('span');
      state.className = 'state ' + a.state;
      state.textContent = a.state === 'error' ? (a.message || STATE_LABEL.error) : STATE_LABEL[a.state] || a.state;
      state.title = a.message || '';
      const count = document.createElement('span');
      count.textContent = `${a.count} 則推文`;
      meta.append(board, state, count);
      info.append(title, meta);

      const rm = document.createElement('button');
      rm.className = 'rm';
      rm.type = 'button';
      rm.textContent = '✕';
      rm.title = '停止追蹤';
      rm.setAttribute('aria-label', `停止追蹤 ${a.title || a.url}`);
      rm.onclick = () => danmaku.removeArticle(a.url);

      li.append(dot, info, rm);
      ul.appendChild(li);
    }
    $('emptyArticles').hidden = articles.length > 0;
    $('articleCount').textContent = articles.length ? `(${articles.length})` : '';
    const live = articles.filter((a) => a.state === 'live').length;
    $('summary').textContent = !articles.length ? '尚未追蹤文章'
      : live === articles.length ? `正在即時追蹤 ${live} 篇文章`
        : `追蹤 ${articles.length} 篇,其中 ${live} 篇即時更新中`;
    markFollowedInBoard();
  }

  // ---- 最新推文 ----
  function addFeed(msg) {
    const ul = $('feed');
    const stick = ul.scrollHeight - ul.scrollTop - ul.clientHeight < 30;
    const li = document.createElement('li');
    const tag = document.createElement('span');
    tag.className = 'tag ' + (msg.tag === '推' ? 'push' : msg.tag === '噓' ? 'boo' : 'arrow');
    tag.textContent = msg.tag;
    const who = document.createElement('span');
    who.className = 'who';
    who.style.color = msg.color;
    who.textContent = msg.user;
    li.append(tag, who, document.createTextNode(msg.content));
    li.title = `${msg.title || ''} ${msg.time || ''}`.trim();
    ul.appendChild(li);
    while (ul.children.length > FEED_MAX) ul.firstChild.remove();
    $('emptyFeed').hidden = true;
    if (stick) ul.scrollTop = ul.scrollHeight;
  }

  // ---- 看板瀏覽 ----
  function renderBoards(list) {
    const boards = (list && list.length ? list : DEFAULT_BOARDS);
    const box = $('boards');
    box.textContent = '';
    for (const b of boards) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = b;
      chip.title = `看 ${b} 板最新的文章`;
      chip.onclick = () => openBoard(b);
      box.appendChild(chip);
    }
  }

  function nrecClass(nrec) {
    if (nrec === '爆') return 'hot';
    if (/^X/.test(nrec)) return '';
    const n = Number(nrec);
    return n >= 10 ? 'warm' : n > 0 ? 'some' : '';
  }

  function markFollowedInBoard() {
    const followed = new Set(articles.map((a) => a.url));
    for (const btn of $('boardList').querySelectorAll('button')) {
      const on = followed.has(btn.dataset.url);
      btn.disabled = on;
      btn.querySelector('.bmeta').textContent = on ? '追蹤中' : btn.dataset.meta;
    }
  }

  async function openBoard(name) {
    notice('busy', `讀取 ${name} 板…`, true);
    const res = await danmaku.listBoard(name);
    if (!res.ok) { notice('error', res.error); return; }
    notice();
    renderBoards(res.recentBoards);
    $('boardTitle').textContent = `${res.board} 板 · 點一篇開始追蹤`;
    const ul = $('boardList');
    ul.textContent = '';
    for (const item of res.items) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.url = item.url;
      btn.dataset.meta = `${item.pinned ? '置底 · ' : ''}${item.date}`;
      const nrec = document.createElement('span');
      nrec.className = 'nrec ' + nrecClass(item.nrec);
      nrec.textContent = item.nrec || '·';
      const title = document.createElement('span');
      title.className = 'btitle';
      title.textContent = item.title;
      title.title = `${item.title}(${item.author})`;
      const meta = document.createElement('span');
      meta.className = 'bmeta';
      btn.append(nrec, title, meta);
      btn.onclick = () => add(item.url);
      li.appendChild(btn);
      ul.appendChild(li);
    }
    markFollowedInBoard();
    $('boardPanel').hidden = false;
    ul.scrollTop = 0;
  }

  // ---- 加入文章 ----
  async function add(input) {
    const res = await danmaku.addArticle(input);
    if (!res.ok) { notice('error', res.error); return false; }
    notice('ok', '已開始追蹤,新推文會直接飄過螢幕。');
    return true;
  }

  $('addForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const value = $('addInput').value.trim();
    if (!value) { $('addInput').focus(); return; }
    if (ARTICLE_RE.test(value)) {
      if (await add(value)) $('addInput').value = '';
    } else {
      await openBoard(value);
      if (!$('boardPanel').hidden) $('addInput').value = '';
    }
  });
  $('boardClose').onclick = () => { $('boardPanel').hidden = true; };

  // ---- 剪貼簿提示 ----
  async function checkClipboard() {
    const url = await danmaku.clipboardArticle();
    clipUrl = url && url !== dismissedClip ? url : null;
    $('clipHint').hidden = !clipUrl;
  }
  $('clipAdd').onclick = async () => {
    if (clipUrl) await add(clipUrl);
    dismissedClip = clipUrl;
    $('clipHint').hidden = true;
  };
  $('clipDismiss').onclick = () => { dismissedClip = clipUrl; $('clipHint').hidden = true; };
  window.addEventListener('focus', checkClipboard);

  // ---- 彈幕開關 ----
  function renderOverlay(visible) {
    $('overlayToggle').checked = visible;
    $('overlayLabel').textContent = visible ? '彈幕顯示中' : '彈幕已隱藏';
  }
  $('overlayToggle').addEventListener('change', (e) => danmaku.setOverlayVisible(e.target.checked));
  $('demoBtn').onclick = () => danmaku.demo();

  // ---- 外觀設定 ----
  const SLIDERS = {
    fontSize: { toUi: (v) => v, fromUi: (v) => v, label: (v) => `${v}px` },
    speed: { toUi: (v) => v, fromUi: (v) => v, label: (v) => `${v}` },
    opacity: { toUi: (v) => Math.round(v * 100), fromUi: (v) => v / 100, label: (v) => `${v}%` },
    areaRatio: { toUi: (v) => Math.round(v * 100), fromUi: (v) => v / 100, label: (v) => `${v}%` },
  };
  const CHECKS = ['showBoo', 'showArrow', 'showUser'];

  function renderSettings(s) {
    for (const [key, conv] of Object.entries(SLIDERS)) {
      $(key).value = conv.toUi(s[key]);
      $(key + 'V').textContent = conv.label($(key).value);
    }
    for (const key of CHECKS) $(key).checked = !!s[key];
    $('blockWords').value = s.blockWords || '';
    if (s.displayId !== null && s.displayId !== undefined) $('displayId').value = String(s.displayId);
  }

  function renderDisplays(displays, current) {
    const sel = $('displayId');
    const keep = current !== undefined ? current : sel.value;
    sel.textContent = '';
    for (const d of displays) {
      const opt = document.createElement('option');
      opt.value = String(d.id);
      opt.textContent = d.label;
      sel.appendChild(opt);
    }
    if (keep !== null && [...sel.options].some((o) => o.value === String(keep))) sel.value = String(keep);
    $('displayField').hidden = displays.length < 2;
  }

  for (const [key, conv] of Object.entries(SLIDERS)) {
    $(key).addEventListener('input', () => {
      $(key + 'V').textContent = conv.label($(key).value);
      danmaku.updateSettings({ [key]: conv.fromUi(Number($(key).value)) });
    });
  }
  for (const key of CHECKS) {
    $(key).addEventListener('change', () => danmaku.updateSettings({ [key]: $(key).checked }));
  }
  $('blockWords').addEventListener('input', () => danmaku.updateSettings({ blockWords: $('blockWords').value }));
  $('displayId').addEventListener('change', () => danmaku.updateSettings({ displayId: Number($('displayId').value) }));

  // ---- 啟動 ----
  danmaku.on('articles', renderArticles);
  danmaku.on('comment', addFeed);
  danmaku.on('overlay-visible', renderOverlay);
  danmaku.on('displays', (d) => renderDisplays(d));

  danmaku.init().then((init) => {
    renderDisplays(init.displays, init.settings.displayId);
    renderSettings(init.settings);
    renderArticles(init.articles);
    renderBoards(init.recentBoards);
    renderOverlay(init.overlayVisible);
    $('shortcutHint').textContent = `${init.shortcut} 隨時顯示／隱藏彈幕`;
    $('version').textContent = `v${init.version}`;
    checkClipboard();
    $('addInput').focus();
  });
})();
