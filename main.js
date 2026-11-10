'use strict';
const {
  app, BrowserWindow, Menu, Tray, clipboard, globalShortcut, ipcMain, nativeImage, screen, shell,
} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { Store, sanitizeSettings } = require('./src/store');
const { WatchManager } = require('./src/manager');
const { parseArticleUrl, parseBoardName } = require('./src/ptt');

const SHORTCUT = 'CommandOrControl+Shift+D';
const SHORTCUT_LABEL = process.platform === 'darwin' ? '⌘⇧D' : 'Ctrl+Shift+D';
const SMOKE_DIR = process.env.PTT_DANMAKU_SMOKE || '';

const DEMO_LINES = [
  ['推', 'tennisfan', '這球太扯了吧!!!'],
  ['推', 'acefans', 'Alcaraz 正拍尾勁有夠噁'],
  ['噓', 'badcall', '這顆明明出界 鷹眼勒'],
  ['→', 'watcher99', '第三盤要開始了'],
  ['推', 'netking', '上網截擊漂亮'],
  ['推', 'gostraight', 'ACE!!!!!'],
  ['→', 'lurker', '有人有高畫質連結嗎'],
  ['推', 'slicelover', '這切球角度太刁鑽'],
];

// 只允許一個實例;第二次啟動時把控制台叫到前面
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let store = null;
let manager = null;
let overlayWin = null;
let controlWin = null;
let tray = null;
let overlayVisible = true;
let quitting = false;

function sendTo(win, channel, payload) {
  if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(channel, payload);
}

// ---- 彈幕 overlay ----

function targetDisplay() {
  const wanted = store.data.settings.displayId;
  return screen.getAllDisplays().find((d) => d.id === wanted) || screen.getPrimaryDisplay();
}

function displayList() {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => ({
    id: d.id,
    label: `螢幕 ${i + 1}(${d.size.width}×${d.size.height})${d.id === primary ? ' 主螢幕' : ''}`,
  }));
}

function placeOverlay() {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  overlayWin.setBounds(targetDisplay().bounds);
}

function createOverlay() {
  const { bounds } = targetDisplay();
  overlayWin = new BrowserWindow({
    ...bounds,
    show: false,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    fullscreenable: false,
    enableLargerThanScreen: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
    },
  });
  // 蓋在所有東西上面(包含全螢幕影片),滑鼠事件全部穿透
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWin.setIgnoreMouseEvents(true);
  overlayWin.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
  overlayWin.once('ready-to-show', () => {
    if (overlayVisible) overlayWin.showInactive();
    placeOverlay(); // macOS 顯示視窗時可能自己挪位置,顯示後再對齊一次
  });
}

function setOverlayVisible(visible) {
  overlayVisible = !!visible;
  if (overlayWin && !overlayWin.isDestroyed()) {
    if (overlayVisible) { overlayWin.showInactive(); placeOverlay(); } else overlayWin.hide();
  }
  store.data.overlayVisible = overlayVisible;
  store.save();
  sendTo(controlWin, 'overlay-visible', overlayVisible);
  refreshTray();
}

// ---- 控制台 ----

function createControl() {
  controlWin = new BrowserWindow({
    width: 440,
    height: 780,
    minWidth: 380,
    minHeight: 520,
    title: 'PTT 彈幕',
    backgroundColor: '#15171c',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // 控制台被遮住時也要即時更新清單
      backgroundThrottling: false,
    },
  });
  controlWin.loadFile(path.join(__dirname, 'renderer', 'control.html'));
  controlWin.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/www\.ptt\.cc\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  controlWin.on('closed', () => { controlWin = null; app.quit(); });
}

function showControl() {
  if (!controlWin) return;
  if (controlWin.isMinimized()) controlWin.restore();
  controlWin.show();
  controlWin.focus();
}

// ---- 系統列 ----

function refreshTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: overlayVisible ? '隱藏彈幕' : '顯示彈幕', accelerator: SHORTCUT, click: () => setOverlayVisible(!overlayVisible) },
    { label: '開啟控制台', click: showControl },
    { type: 'separator' },
    { label: '結束 PTT 彈幕', click: () => app.quit() },
  ]));
}

function createTray() {
  const file = path.join(__dirname, 'assets',
    process.platform === 'darwin' ? 'trayTemplate.png' : 'tray.png');
  if (!fs.existsSync(file)) return;
  tray = new Tray(nativeImage.createFromPath(file));
  tray.setToolTip('PTT 彈幕');
  if (process.platform !== 'darwin') tray.on('click', showControl);
  refreshTray();
}

// ---- 文章與設定 ----

function persistArticles() {
  store.data.articles = manager.urls();
  store.save();
}

function rememberBoard(board) {
  const list = store.data.recentBoards.filter((b) => b.toLowerCase() !== board.toLowerCase());
  list.unshift(board);
  store.data.recentBoards = list.slice(0, 6);
  store.save();
}

function runDemo() {
  DEMO_LINES.forEach(([tag, user, content], i) => {
    setTimeout(() => {
      const msg = {
        url: 'demo', board: 'Tennis', title: '測試彈幕', color: i % 2 ? '#ffb74d' : '#4fc3f7',
        tag, user, content, time: '', backlog: false, demo: true,
      };
      sendTo(overlayWin, 'comment', msg);
      sendTo(controlWin, 'comment', msg);
    }, i * 600);
  });
}

function registerIpc() {
  ipcMain.handle('app:init', () => ({
    settings: store.data.settings,
    articles: manager.list(),
    recentBoards: store.data.recentBoards,
    overlayVisible,
    displays: displayList(),
    shortcut: SHORTCUT_LABEL,
    version: app.getVersion(),
    platform: process.platform,
  }));

  ipcMain.handle('overlay:init', () => ({ settings: store.data.settings }));

  ipcMain.handle('articles:add', (_e, input) => {
    const result = manager.add(String(input || ''));
    if (result.ok) {
      persistArticles();
      rememberBoard(parseArticleUrl(result.url).board);
    }
    return result;
  });

  ipcMain.handle('articles:remove', (_e, url) => {
    manager.remove(String(url || ''));
    persistArticles();
    return { ok: true };
  });

  ipcMain.handle('board:list', async (_e, input) => {
    const board = parseBoardName(input);
    if (!board) return { ok: false, error: '請輸入看板名稱(例如 Tennis)或貼上文章網址。' };
    const result = await manager.listBoard(board);
    if (result.ok) rememberBoard(result.board);
    return { ...result, recentBoards: store.data.recentBoards };
  });

  ipcMain.handle('settings:update', (_e, patch) => {
    const before = store.data.settings.displayId;
    store.data.settings = sanitizeSettings(patch, store.data.settings);
    store.save();
    if (store.data.settings.displayId !== before) placeOverlay();
    sendTo(overlayWin, 'settings', store.data.settings);
    return store.data.settings;
  });

  ipcMain.handle('overlay:set-visible', (_e, visible) => { setOverlayVisible(visible); return overlayVisible; });
  ipcMain.handle('demo', () => { if (!overlayVisible) setOverlayVisible(true); runDemo(); return true; });

  // 剪貼簿裡如果剛好是 PTT 文章網址,控制台會主動問要不要加入
  ipcMain.handle('clipboard:article', async () => {
    // 新版 Electron 的 readText 會回傳 Promise,舊版直接回傳字串;兩種都接
    const text = String(await clipboard.readText() || '');
    const art = parseArticleUrl(text.trim().slice(0, 300));
    return art && !manager.urls().includes(art.url) ? art.url : null;
  });
}

// ---- 自我檢查(開發/CI 用):截圖後自動結束 ----

async function runSmoke() {
  fs.mkdirSync(SMOKE_DIR, { recursive: true });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const url = process.env.PTT_DANMAKU_SMOKE_URL;
  await wait(1500);
  if (url) manager.add(url);
  runDemo();
  await wait(Number(process.env.PTT_DANMAKU_SMOKE_WAIT || 3500));
  const shots = { control: controlWin, overlay: overlayWin };
  for (const [name, win] of Object.entries(shots)) {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(SMOKE_DIR, `${name}.png`), img.toPNG());
  }
  fs.writeFileSync(path.join(SMOKE_DIR, 'result.json'), JSON.stringify({
    articles: manager.list(),
    overlayBounds: overlayWin.getBounds(),
    overlayVisible: overlayWin.isVisible(),
    overlayOnTop: overlayWin.isAlwaysOnTop(),
    shortcutRegistered: globalShortcut.isRegistered(SHORTCUT),
    tray: !!tray,
  }, null, 2));
  app.quit();
}

// ---- 啟動 ----

app.on('second-instance', showControl);

app.whenReady().then(() => {
  store = new Store(path.join(app.getPath('userData'), 'config.json'));
  overlayVisible = store.data.overlayVisible;
  manager = new WatchManager();

  manager.on('comment', (msg) => {
    sendTo(overlayWin, 'comment', msg);
    sendTo(controlWin, 'comment', msg);
  });
  manager.on('articles', (list) => sendTo(controlWin, 'articles', list));

  registerIpc();
  createOverlay();
  createControl();
  createTray();

  // 上次追蹤的文章自動接回來(不重播舊推文)
  for (const url of store.data.articles) manager.add(url, { backlog: 0 });

  globalShortcut.register(SHORTCUT, () => setOverlayVisible(!overlayVisible));

  const onDisplaysChanged = () => {
    placeOverlay();
    sendTo(controlWin, 'displays', displayList());
  };
  screen.on('display-added', onDisplaysChanged);
  screen.on('display-removed', onDisplaysChanged);
  screen.on('display-metrics-changed', onDisplaysChanged);

  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' },
    ]));
  } else {
    Menu.setApplicationMenu(null);
  }

  if (SMOKE_DIR) runSmoke().catch((err) => { console.error(err); app.exit(1); });
});

app.on('before-quit', () => { quitting = true; });

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (manager) manager.stopAll();
  if (store) store.flush();
});

app.on('window-all-closed', () => app.quit());

process.on('uncaughtException', (err) => {
  console.error('未預期的錯誤', err);
  if (!quitting && SMOKE_DIR) app.exit(1);
});
