const { app, BrowserWindow, screen, globalShortcut, dialog } = require('electron');
const { spawn } = require('child_process');
const fs = require('node:fs');
const path = require('path');
const { getBackendLaunch, getShortcutLabel, getPortConflictHelp } = require('./runtime');

// 只允許一個實例,避免兩個後端搶同一個埠
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let overlayWin = null;
let controlWin = null;
let backendProc = null;
let quitting = false;

function startBackend() {
  let launch;
  try {
    launch = getBackendLaunch({
      isPackaged: app.isPackaged,
      platform: process.platform,
      resourcesPath: process.resourcesPath,
      projectRoot: path.join(__dirname, '..'),
    });
  } catch (err) {
    dialog.showErrorBox('後端啟動失敗', err.message);
    return;
  }

  if (!fs.existsSync(launch.command)) {
    dialog.showErrorBox('後端啟動失敗',
      `找不到後端執行檔：${launch.command}\n請重新解壓縮完整的 Windows ZIP。`);
    return;
  }

  let spawnFailed = false;
  backendProc = spawn(launch.command, launch.args, {
    stdio: 'inherit',
    windowsHide: true,
  });
  backendProc.on('error', (err) => {
    spawnFailed = true;
    dialog.showErrorBox('後端啟動失敗', `無法執行後端：${err.message}`);
  });
  backendProc.on('exit', (code) => {
    console.log('backend exited', code);
    backendProc = null;
    if (quitting || spawnFailed) return;
    if (code === 48) {
      dialog.showErrorBox('後端啟動失敗',
        `9737 埠已被占用。${getPortConflictHelp(process.platform)}`);
    } else if (code !== 0 && code !== null) {
      dialog.showErrorBox('後端異常結束',
        `內附後端結束（代碼 ${code}）。請重新啟動；若持續發生，請保留錯誤畫面。`);
    }
  });
}

function createOverlay() {
  const { bounds } = screen.getPrimaryDisplay();
  overlayWin = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    fullscreenable: false,
    webPreferences: { backgroundThrottling: false }
  });
  // 蓋在所有東西上面(包含全螢幕影片),滑鼠事件全部穿透
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWin.setIgnoreMouseEvents(true);
  overlayWin.loadFile('overlay.html');
}

function createControl() {
  controlWin = new BrowserWindow({
    width: 460,
    height: 640,
    title: 'PTT 彈幕控制台',
    // 控制面板縮小/被遮住時不要節流計時器,否則心跳會誤判斷線而一直重連
    webPreferences: { backgroundThrottling: false }
  });
  controlWin.loadFile('control.html', {
    query: { platform: process.platform, shortcut: getShortcutLabel(process.platform) },
  });
  controlWin.on('closed', () => app.quit());
}

app.whenReady().then(() => {
  startBackend();
  createOverlay();
  createControl();
  // macOS 用 Cmd+Shift+D，Windows 用 Ctrl+Shift+D。
  globalShortcut.register('CommandOrControl+Shift+D', () => {
    if (!overlayWin) return;
    overlayWin.isVisible() ? overlayWin.hide() : overlayWin.showInactive();
  });
});

app.on('will-quit', () => {
  quitting = true;
  globalShortcut.unregisterAll();
  if (backendProc) backendProc.kill();
});

app.on('window-all-closed', () => app.quit());
