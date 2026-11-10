# 更新紀錄

格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.1.0/),版本號遵循 [Semantic Versioning](https://semver.org/lang/zh-TW/)。

## [1.0.0] - 2026-11-11

第一個公開版本。

### 新增

- 改用 PTT 網頁版的即時推文串流(`/v1/longpoll` + `/poll/...`)取得新推文,**不再需要登入 PTT**。
- 同時追蹤最多 8 篇文章,每篇有自己的代表色。
- 貼上 `www.ptt.cc` 文章網址,或輸入看板名稱從最新文章列表挑選;複製網址後切回控制台會主動詢問是否加入。
- 外觀設定:字體大小、移動速度、不透明度、顯示範圍、是否顯示噓文／→／推文者 ID。
- 關鍵字過濾、多螢幕選擇、系統列圖示、全域快捷鍵 `Cmd/Ctrl+Shift+D`。
- 追蹤清單與設定自動保存,下次開啟時接回。
- macOS(arm64 / x64)與 Windows(x64 安裝版 / 免安裝版)打包。
- 單元測試與 GitHub Actions CI;推送 `v*` 標籤時自動建立 Release。

### 移除

- 舊版的 PyPtt Python 後端與 PTT 帳號登入流程。

[1.0.0]: https://github.com/jeje898281/ptt-danmaku/releases/tag/v1.0.0
