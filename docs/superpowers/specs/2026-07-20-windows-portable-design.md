# PTT 彈幕 Windows 可攜版設計

## 目標

將現有 macOS 專案改成同一份原始碼可在 macOS 開發，並可產生 Windows 10/11 x64 可攜版。Windows 使用者不需安裝 Python、Node.js 或 npm 套件，下載 ZIP、解壓縮後雙擊 `PTT彈幕.exe` 即可使用。ZIP 預期透過 Google Drive 分享連結寄送，不要求低於一般 Email 附件大小限制。

## 現況與限制

目前資料夾不能直接複製到 Windows：

- `app/node_modules` 內是 macOS ARM64 Electron 執行檔。
- `backend/.venv` 是 macOS Python 虛擬環境。
- `app/main.js` 將後端路徑寫成 Unix 的 `.venv/bin/python`。
- `啟動彈幕.command` 只能由 macOS 的 zsh 執行。
- 操作提示、錯誤處理與字型設定含有 macOS 專用內容。

Windows 成品不能由 PyInstaller 在 macOS 上直接交叉編譯，因此最終 Windows 後端及整套可攜版必須在 Windows x64 建置環境產生。建置環境可以是實體 Windows 電腦或日後接上的 Windows CI；成品使用者不需要這些建置工具。

## 採用方案

使用 Electron 保留現有控制台與透明置頂彈幕層，並用 PyInstaller 將 Python 後端及其 PyPtt、websockets 相依打包成 Windows 執行檔。Electron 打包時把後端執行檔放入應用程式 resources，再輸出 Windows x64 可攜版。

未採用的方案：

- 將 PyPtt 後端改寫成 JavaScript：會大幅增加改寫及 PTT 協定相容風險。
- 第一次執行時自動安裝 Python／Node.js：不符合解壓後直接使用的目標。

## 程式結構與行為

### 後端啟動

Electron 主程序集中處理後端路徑：

- 開發模式依平台使用 `backend/.venv/bin/python` 或 `backend/.venv/Scripts/python.exe` 執行 `server.py`。
- Windows 打包模式直接執行 resources 內的 `ptt-backend.exe`。
- 啟動失敗、執行檔不存在及 9737 埠占用時，顯示 Windows 可理解的錯誤與處理方式，不再提示 `pkill`。
- 關閉控制台或整個應用程式時，同步終止後端程序。

### Windows 視窗與操作

保留既有的全螢幕透明、置頂、滑鼠穿透彈幕層，以及獨立控制台。快捷鍵仍使用 Electron 的跨平台 `CommandOrControl+Shift+D`，畫面提示在 Windows 顯示 `Ctrl+Shift+D`、macOS 顯示 `Cmd+Shift+D`。

中文顯示的字型 fallback 加入 Windows 內建的 `Microsoft JhengHei` 與通用 `system-ui`。Windows 全螢幕直播若採用獨占全螢幕，置頂視窗可能無法覆蓋；使用瀏覽器或播放器的無邊框／視窗化全螢幕可維持彈幕置頂。

### 打包與交付

新增可重現的 Windows 建置流程：

1. 建立 Windows Python 虛擬環境並依固定的 requirements 安裝後端套件。
2. 以 PyInstaller 產生 `ptt-backend.exe`。
3. 以 npm 安裝鎖定的 Electron 相依套件。
4. 以 electron-builder 產生 Windows x64 可攜版。
5. 將成品與簡短的 Windows 使用說明壓成 ZIP。

建置腳本遇到缺少 Python、Node.js、npm、建置失敗或成品缺漏時要立即停止，並顯示可操作的繁體中文錯誤。成品不包含 PTT 帳號密碼；帳密仍只在使用期間送到本機 `127.0.0.1` 後端。

## 驗證

在目前 macOS 工作區執行不需 Windows 的檢查：

- 後端 Python 語法與既有啟動能力。
- Node.js 路徑選擇、打包／開發模式分支及平台提示測試。
- Electron 前端檔案與 package 設定檢查。

在 Windows 10/11 x64 建置機執行最終驗證：

- 建置腳本可從乾淨依賴狀態產生 ZIP。
- 在未安裝 Python／Node.js 的 Windows 使用者環境解壓並啟動。
- 控制台能連上內附後端，測試彈幕可顯示。
- PTT 登入、加入文章、新推文輪詢與移除文章正常。
- `Ctrl+Shift+D`、滑鼠穿透、置頂、關閉後端及重複啟動防護正常。
- 路徑包含空白與中文時仍可啟動。

## 不在本次範圍

- Windows ARM64 或 32 位元版本。
- 程式碼簽章與 SmartScreen 信譽憑證。
- 自動更新、安裝程式或發布到 Microsoft Store。
- 自動上傳 Google Drive 或代替使用者寄信；本次只產生適合手動上傳分享的 ZIP。
