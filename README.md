# PTT 彈幕 (ptt-danmaku)

邊看直播,邊把 PTT 指定文章的最新推文用彈幕飄在螢幕最上層。支援 macOS 與 Windows,**不需要登入 PTT**。

## 怎麼用

1. 開啟 App,會出現一個控制台視窗,以及一層看不見、蓋在整個螢幕上的彈幕層。
2. 加入想追蹤的文章,兩種方式擇一:
   - 貼上 `www.ptt.cc` 的文章網址後按 Enter。複製網址後切回控制台,它也會主動問你要不要加入。
   - 輸入看板名稱(例如 `Tennis`),從最新文章列表點一篇。
3. 打開你的直播。新推文會直接飄過畫面,滑鼠點擊會穿透彈幕層,不影響操作。

最多同時追蹤 8 篇,每篇有自己的代表色。追蹤清單和外觀設定會自動記住,下次開啟時接回。

| 操作 | 方式 |
| --- | --- |
| 顯示／隱藏彈幕 | `Cmd+Shift+D`(macOS)或 `Ctrl+Shift+D`(Windows)、控制台右上角開關、系統列圖示 |
| 看彈幕長什麼樣子 | 「播放測試彈幕」 |
| 調整外觀 | 字體大小、移動速度、不透明度、顯示範圍、是否顯示噓文／→／推文者 ID |
| 過濾內容 | 「不想看到的字詞」,用空白或逗號分隔 |
| 換螢幕 | 接了兩個以上螢幕時,可選彈幕顯示在哪一個 |

關閉控制台視窗就會結束 App。

## 下載與安裝

到 [Releases](../../releases) 下載:

- **macOS**:`PTT-Danmaku-<版本>-mac-arm64.dmg`(Apple 晶片)或 `-x64.dmg`(Intel)。
  App 沒有經過 Apple 公證,第一次開啟請在 Finder 對 App 按右鍵 →「打開」;若仍被擋下,執行
  `xattr -cr "/Applications/PTT彈幕.app"` 後再開。
- **Windows 10/11**:`...-win-x64-setup.exe`(安裝版)或 `...-win-x64-portable.exe`(免安裝)。
  沒有程式碼簽章,SmartScreen 出現時選「其他資訊」→「仍要執行」。

## 已知限制

- 資料來源是 PTT 網頁版,所以只能追蹤網頁版看得到的看板與文章(隱板、好友板不行)。
- 新推文通常幾秒內出現;PTT 網頁端偶爾會晚通知,最慢十幾秒內會補上。
- Windows 的「獨占全螢幕」可能擋住彈幕,請把播放器或遊戲改成無邊框／視窗化全螢幕。
- 太舊的文章 PTT 不提供即時更新,會顯示「不支援即時更新」。

## 運作原理

PTT 網頁版的文章頁本身就有「推文自動更新」功能。這個 App 用的是同一套機制:

1. 讀文章頁,拿到標題、既有推文,以及即時更新用的參數。
2. 對 `/v1/longpoll` 發長輪詢,伺服器在文章有新內容時回應目前的大小。
3. 用 `/poll/...` 取回這段新增的推文,解析後送到彈幕層。

連線失敗會自動退避重試,連續失敗多次則整篇重新載入。整個流程在 Electron 主程序內完成,沒有額外的後端程式,也不會碰到你的 PTT 帳號。

```
main.js              視窗、系統列、快捷鍵、IPC
preload.js           提供給畫面的安全 API
src/ptt.js           解析 PTT 網頁(文章、推文、看板列表)
src/http.js          對 www.ptt.cc 的 HTTP 請求
src/watcher.js       追蹤單篇文章的長輪詢迴圈
src/manager.js       管理多篇文章、配色
src/store.js         設定與追蹤清單的儲存
renderer/            控制台與彈幕層畫面
```

## 開發

需要 Node.js 22 以上。

```bash
npm install
npm start            # 啟動 App
npm test             # 單元測試
npm run live-check   # 對真實 PTT 追蹤一篇熱門文章 40 秒,確認資料來源正常
```

打包:

```bash
npm run dist:mac     # 在 macOS 上產生 dmg / zip
npm run dist:win     # 在 Windows 上產生安裝版與免安裝版
```

推送 `v*` 標籤(例如 `v1.0.0`)時,GitHub Actions 會在 macOS 與 Windows 上各自測試、打包,並把成品附到該版本的 Release。
