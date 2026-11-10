# Windows AI 交接

## 目標

在 Windows 10/11 x64 產生 `release-windows\PTT彈幕-Windows-x64.zip`。收件者解壓後應能直接執行 `PTT彈幕.exe`，不需安裝 Python、Node.js 或 npm 套件。

## 已完成

- Electron 主程序已支援 macOS／Windows 開發路徑，以及 Windows 打包後的 `resources\backend\ptt-backend.exe`。
- Windows 快捷鍵提示為 `Ctrl+Shift+D`，並加入 `Microsoft JhengHei` 字型 fallback。
- `backend/requirements.txt` 與 `backend/requirements-build.txt` 已鎖定依賴。
- `app/package.json` 已設定 electron-builder Windows x64 portable target。
- `build-windows.ps1` 會依序建置 PyInstaller 後端、Electron portable EXE，最後產生 ZIP。
- macOS 上已通過 6 個 Node.js 測試、Node/Python 語法、Python 匯入及打包設定檢查。

## 尚未完成

- 必須在 Windows 10/11 x64 執行 `build-windows.ps1`，因 PyInstaller 不能在 macOS 交叉產生 Windows 執行檔。
- 必須在沒有安裝 Python／Node.js 的 Windows 使用者環境執行最終 ZIP smoke test。
- 此資料夾不是 Git repository，不要假設有 commit 或可用的 Git diff。

## Windows AI 請依序處理

1. 完整閱讀：
   - `WINDOWS_AI交接.md`
   - `docs/superpowers/specs/2026-07-20-windows-portable-design.md`
   - `docs/superpowers/plans/2026-07-20-windows-portable.md`
2. 檢查 Windows 建置機具有：
   - Windows 10/11 x64
   - 64 位元 Python 3.11 以上
   - Node.js 20，或 Node.js 22 以上版本（不要使用 Node.js 21）
3. 在專案根目錄執行：

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\build-windows.ps1
   ```

4. 若建置失敗，先保留完整錯誤輸出並找出根因，再修改最小範圍；不要重寫目前架構。
5. 建置成功後確認：
   - `release-windows\PTT彈幕-Windows-x64.zip` 存在。
   - ZIP 只含 `PTT彈幕.exe` 與 `WINDOWS使用說明.txt`。
6. 解壓 ZIP 並測試控制台、測試彈幕、PTT 登入／文章輪詢、`Ctrl+Shift+D`、關閉後端及重複啟動防護。
7. 最後執行並回報雜湊：

   ```powershell
   Get-FileHash .\release-windows\PTT彈幕-Windows-x64.zip -Algorithm SHA256
   ```

## 可直接貼給 Windows AI 的訊息

> 請接續完成這個 PTT 彈幕 Windows 可攜版。先完整閱讀 `WINDOWS_AI交接.md`、設計規格和實作計畫，不要重做已完成的 macOS 修改。請從 Windows x64 建置與 smoke test 繼續，執行 `build-windows.ps1`，遇到失敗先找根因並做最小修正。最後確認 `release-windows\PTT彈幕-Windows-x64.zip` 可在未安裝 Python／Node.js 的 Windows 環境使用，並回報 ZIP 大小與 SHA-256。
