# 參與貢獻

歡迎回報問題、提出建議或送 Pull Request!

## 回報問題

開 [Issue](https://github.com/jeje898281/ptt-danmaku/issues) 時請附上:

- 作業系統與版本(例如 macOS 15 / Windows 11)、App 版本
- 追蹤的文章網址(若問題跟特定文章有關)
- 重現步驟、預期結果與實際結果
- 必要時附上截圖

## 開發流程

需要 Node.js 22 以上。

```bash
npm install
npm start      # 啟動 App
npm test       # 單元測試
```

改到 `src/ptt.js`、`src/http.js` 或 `src/watcher.js` 等資料來源相關程式時,請另外跑:

```bash
npm run live-check
```

它會對真實 PTT 追蹤一篇熱門文章 40 秒,確認解析與長輪詢仍然正常。

## Pull Request

1. 從 `main` 開新分支。
2. 新功能或修正請盡量附上測試(`test/` 底下,使用 Node 內建的 `node:test`)。
3. 確認 `npm test` 通過。
4. Commit 訊息建議採用 [Conventional Commits](https://www.conventionalcommits.org/zh-hant/v1.0.0/) 格式,例如 `feat: ...`、`fix: ...`。
5. 使用者看得到的改動請順手更新 `CHANGELOG.md`。

## 對 PTT 友善

本專案直接使用 PTT 網頁版的公開介面。請避免加入會大幅增加請求量的功能(例如極短間隔的輪詢、大量同時追蹤),以免造成 PTT 伺服器負擔。
