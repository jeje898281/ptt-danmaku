# PTT 彈幕 (ptt-danmaku)

邊看網球直播,邊把 PTT 指定文章(可多篇)的最新推文用彈幕飄在螢幕最上層。

## 原理

- 後端用 [PyPtt](https://pyptt.cc/) 透過 PTT 官方 WebSocket(`wss://ws.ptt.cc/bbs`)
  用你的帳號登入,像終端機使用者一樣直接讀文章 —— **沒有網頁版的快取延遲**,
  每 2 秒輪詢一次指定文章,diff 出新推文。
- 新推文透過本機 WebSocket(`ws://127.0.0.1:9737`)廣播給 Electron。
- Electron 開一個全螢幕、透明、滑鼠穿透、置頂(蓋過全螢幕影片)的視窗畫彈幕,
  另開一個控制台視窗管理帳號、文章與彈幕設定。

## macOS 開發啟動

```bash
cd app
npm start
```

Electron 會自動把 Python 後端帶起來,不用另外跑。

## Windows 可攜版

收件者不需安裝 Python 或 Node.js：解壓 `PTT彈幕-Windows-x64.zip`，再雙擊 `PTT彈幕.exe`。

Windows 成品必須在 Windows 10/11 x64 建置機產生。建置機需先安裝 64 位元 Python 3.11+，以及 Node.js 20 或 22+，接著在 PowerShell 執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\build-windows.ps1
```

完成品位於 `release-windows\PTT彈幕-Windows-x64.zip`，可上傳 Google Drive 後分享連結。

未簽章版本第一次執行可能出現 SmartScreen「未知發行者」提示。Windows 獨占全螢幕也可能阻擋置頂彈幕，建議使用無邊框或視窗化全螢幕。

## 使用

1. 控制台輸入 PTT 帳號密碼 → 登入(帳密只送到本機後端,不儲存)。
2. 貼上 `www.ptt.cc` 文章網址按 Enter,可加多篇,每篇一個代表色(彈幕的 ID 顏色)。
3. 打開你的網球直播(瀏覽器、App 都行),彈幕會直接飄在畫面上。
4. `Cmd+Shift+D`（macOS）或 `Ctrl+Shift+D`（Windows）：隨時顯示／隱藏整個彈幕層。
5. 「🎾 測試彈幕」按鈕可以不登入先看效果。

## 設定

字體大小、速度、透明度、彈幕佔畫面比例、是否顯示噓文/→ 都在控制台即時調。

## 注意

- 需要 PTT 帳號。「剔除其他登入」勾著的話,登入時會踢掉你在其他地方的連線。
- 輪詢間隔在 `backend/server.py` 的 `POLL_INTERVAL`(預設 2 秒)。
  同時追很多篇又是超長實況文時,每輪讀取時間會變長,延遲會跟著增加。
- 文章連續抓取失敗 5 次(例如被刪文)會自動從清單移除。

## 重新安裝依賴

macOS／Linux：

```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install PyPtt websockets
cd app && npm install
```

Windows 開發環境：

```powershell
cd backend
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..\app
npm install
```
