'use strict';
// 產生 App 圖示與系統列圖示:npm run icons
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const FONT = "'PingFang TC','Microsoft JhengHei','Noto Sans TC',sans-serif";

const appIcon = (size) => `<body style="margin:0;background:transparent">
<div style="width:${size}px;height:${size}px;display:grid;place-items:center">
<div style="width:${size * 0.82}px;height:${size * 0.82}px;border-radius:${size * 0.19}px;
  background:linear-gradient(135deg,#5b8cff,#9b6bff);display:grid;place-items:center;
  font:800 ${size * 0.5}px ${FONT};color:#fff;line-height:1">彈</div></div></body>`;

const trayIcon = (size, color) => `<body style="margin:0;background:transparent">
<div style="width:${size}px;height:${size}px;display:grid;place-items:center;
  font:800 ${size * 0.86}px ${FONT};color:${color};line-height:1">彈</div></body>`;

async function render(makeHtml, size, file) {
  // 一律用大尺寸畫再縮小,小圖示才不會糊
  const big = Math.max(size, 256);
  const html = makeHtml(big);
  const win = new BrowserWindow({
    width: big, height: big, show: false, frame: false, transparent: true,
    useContentSize: true, webPreferences: { offscreen: true },
  });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 300));
  const img = (await win.webContents.capturePage()).resize({ width: size, height: size, quality: 'best' });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, img.toPNG());
  win.destroy();
  console.log('wrote', path.relative(root, file));
}

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.on('window-all-closed', () => {}); // 逐張產生時不要自動結束
app.whenReady().then(async () => {
  const tray = (s) => trayIcon(s, '#000');
  await render(appIcon, 1024, path.join(root, 'build', 'icon.png'));
  await render(tray, 16, path.join(root, 'assets', 'trayTemplate.png'));
  await render(tray, 32, path.join(root, 'assets', 'trayTemplate@2x.png'));
  await render(appIcon, 32, path.join(root, 'assets', 'tray.png'));
  await render(appIcon, 64, path.join(root, 'assets', 'tray@2x.png'));
  app.quit();
});
