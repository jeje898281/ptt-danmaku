# PTT 彈幕 Windows 可攜版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a Windows 10/11 x64 ZIP whose recipient can extract and run `PTT彈幕.exe` without installing Python, Node.js, or npm packages.

**Architecture:** Keep the Electron UI and Python/PyPtt backend. Move platform-specific launch decisions into a small tested Node module, freeze the backend as `ptt-backend.exe` with PyInstaller on Windows, copy it into Electron `resources` with electron-builder, and wrap the portable Electron executable plus usage notes in a ZIP.

**Tech Stack:** Electron 33.4.11, Node.js built-in test runner, Python 3.11+, PyPtt 2.1.3, websockets 16.1, PyInstaller 6.21.0, electron-builder 26.0.12, PowerShell 5.1+.

## Global Constraints

- Target Windows 10/11 on Intel/AMD x64; do not add ARM64 or 32-bit builds.
- The recipient must not need Python, Node.js, npm, administrator rights, or an installer.
- Keep PTT credentials in memory and communicate only with the local `127.0.0.1:9737` backend.
- Preserve the macOS `npm start` development flow.
- Produce a ZIP intended for manual Google Drive upload; do not automate uploading or email.
- Do not add signing, auto-update, an installer, or Microsoft Store support.
- PyInstaller output is OS-specific, so the distributable must be built and smoke-tested on Windows x64.
- This workspace is not currently a Git repository. Run the listed verification checkpoints, but skip commit commands unless the user later initializes version control.

## File Structure

- Create `app/runtime.js`: pure platform/runtime path and copy helpers; no Electron imports.
- Create `app/test/runtime.test.js`: Node tests for Windows/macOS development paths, packaged path, shortcut copy, and port-help copy.
- Modify `app/main.js`: consume `runtime.js`, validate the backend executable, spawn it correctly, and pass the platform to the control page.
- Modify `app/control.html`: Windows/macOS shortcut label and platform-neutral reconnect copy.
- Modify `app/overlay.html`: cross-platform Traditional Chinese font fallback.
- Create `backend/requirements.txt`: exact runtime Python dependencies.
- Create `backend/requirements-build.txt`: runtime requirements plus exact PyInstaller version.
- Modify `app/package.json` and `app/package-lock.json`: test/build scripts and exact electron-builder dependency/config.
- Create `build-windows.ps1`: deterministic Windows x64 backend, Electron, portable EXE, and ZIP build orchestration.
- Create `WINDOWS使用說明.txt`: recipient-facing launch, SmartScreen, fullscreen, and troubleshooting notes.
- Modify `README.md`: developer build instructions and Windows artifact limitations.

---

### Task 1: Tested Runtime and Platform Decisions

**Files:**
- Create: `app/runtime.js`
- Create: `app/test/runtime.test.js`
- Modify: `app/package.json`

**Interfaces:**
- Consumes: Node `path` module and a runtime descriptor `{ isPackaged, platform, resourcesPath, projectRoot }`.
- Produces: `getBackendLaunch(runtime): { command: string, args: string[] }`, `getShortcutLabel(platform): string`, and `getPortConflictHelp(platform): string`.

- [ ] **Step 1: Add failing Node tests for all supported path branches and UI copy**

```js
// app/test/runtime.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {
  getBackendLaunch,
  getShortcutLabel,
  getPortConflictHelp,
} = require('../runtime');

test('uses Scripts/python.exe for Windows development', () => {
  assert.deepEqual(getBackendLaunch({
    isPackaged: false,
    platform: 'win32',
    resourcesPath: 'C:\\unused',
    projectRoot: 'C:\\PTT 彈幕',
  }), {
    command: path.win32.join('C:\\PTT 彈幕', 'backend', '.venv', 'Scripts', 'python.exe'),
    args: [path.win32.join('C:\\PTT 彈幕', 'backend', 'server.py')],
  });
});

test('uses bin/python for macOS development', () => {
  assert.deepEqual(getBackendLaunch({
    isPackaged: false,
    platform: 'darwin',
    resourcesPath: '/unused',
    projectRoot: '/Users/test/PTT 彈幕',
  }), {
    command: '/Users/test/PTT 彈幕/backend/.venv/bin/python',
    args: ['/Users/test/PTT 彈幕/backend/server.py'],
  });
});

test('uses bundled backend in a packaged Windows app', () => {
  assert.deepEqual(getBackendLaunch({
    isPackaged: true,
    platform: 'win32',
    resourcesPath: 'C:\\Temp\\portable\\resources',
    projectRoot: 'C:\\ignored',
  }), {
    command: path.win32.join('C:\\Temp\\portable\\resources', 'backend', 'ptt-backend.exe'),
    args: [],
  });
});

test('rejects packaged platforms that have no bundled backend', () => {
  assert.throws(() => getBackendLaunch({
    isPackaged: true,
    platform: 'darwin',
    resourcesPath: '/Applications/PTT.app/Contents/Resources',
    projectRoot: '/ignored',
  }), /Windows/);
});

test('returns platform-specific shortcut and port help', () => {
  assert.equal(getShortcutLabel('win32'), 'Ctrl+Shift+D');
  assert.equal(getShortcutLabel('darwin'), 'Cmd+Shift+D');
  assert.match(getPortConflictHelp('win32'), /工作管理員/);
  assert.match(getPortConflictHelp('darwin'), /pkill/);
});
```

- [ ] **Step 2: Add the test script and run it to verify failure**

```json
"scripts": {
  "start": "electron .",
  "test": "node --test test/*.test.js"
}
```

Run: `cd app && npm test`

Expected: FAIL with `Cannot find module '../runtime'`.

- [ ] **Step 3: Implement the pure runtime helper**

```js
// app/runtime.js
const path = require('node:path');

function getBackendLaunch({ isPackaged, platform, resourcesPath, projectRoot }) {
  const platformPath = platform === 'win32' ? path.win32 : path.posix;
  if (isPackaged) {
    if (platform !== 'win32') {
      throw new Error('目前只有 Windows 打包版內含後端執行檔');
    }
    return {
      command: platformPath.join(resourcesPath, 'backend', 'ptt-backend.exe'),
      args: [],
    };
  }

  const python = platform === 'win32'
    ? platformPath.join(projectRoot, 'backend', '.venv', 'Scripts', 'python.exe')
    : platformPath.join(projectRoot, 'backend', '.venv', 'bin', 'python');
  return {
    command: python,
    args: [platformPath.join(projectRoot, 'backend', 'server.py')],
  };
}

function getShortcutLabel(platform) {
  return platform === 'darwin' ? 'Cmd+Shift+D' : 'Ctrl+Shift+D';
}

function getPortConflictHelp(platform) {
  return platform === 'win32'
    ? '請先關閉其他 PTT 彈幕視窗；若仍無法啟動，請在工作管理員結束殘留的 PTT 彈幕或 ptt-backend。'
    : '請先關閉其他 PTT 彈幕視窗，或執行：pkill -f "backend/server.py"';
}

module.exports = { getBackendLaunch, getShortcutLabel, getPortConflictHelp };
```

- [ ] **Step 4: Run the tests and verify pass**

Run: `cd app && npm test`

Expected: 5 tests pass, 0 fail.

- [ ] **Step 5: Record checkpoint**

Run: `git rev-parse --is-inside-work-tree`

Expected in this workspace: `fatal: not a git repository`; do not initialize Git or commit without user direction.

---

### Task 2: Integrate the Bundled Backend into Electron

**Files:**
- Modify: `app/main.js`
- Modify: `app/test/runtime.test.js`

**Interfaces:**
- Consumes: Task 1 `getBackendLaunch`, `getShortcutLabel`, and `getPortConflictHelp`.
- Produces: Electron startup that supports macOS development, Windows development, and packaged Windows; `control.html?platform=<platform>`.

- [ ] **Step 1: Extend tests with a path containing spaces and Chinese characters**

```js
test('preserves spaces and Chinese characters as one executable argument', () => {
  const launch = getBackendLaunch({
    isPackaged: true,
    platform: 'win32',
    resourcesPath: 'D:\\我的程式\\PTT 彈幕\\resources',
    projectRoot: 'D:\\ignored',
  });
  assert.equal(launch.command, path.win32.join(
    'D:\\我的程式\\PTT 彈幕\\resources', 'backend', 'ptt-backend.exe'));
  assert.deepEqual(launch.args, []);
});
```

- [ ] **Step 2: Run tests to establish the regression guard**

Run: `cd app && npm test`

Expected: 6 tests pass.

- [ ] **Step 3: Replace the hard-coded Unix launch in `main.js`**

Add imports:

```js
const fs = require('node:fs');
const { getBackendLaunch, getShortcutLabel, getPortConflictHelp } = require('./runtime');
```

Replace `startBackend()` with:

```js
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
```

Change control loading to pass the platform:

```js
controlWin.loadFile('control.html', {
  query: { platform: process.platform, shortcut: getShortcutLabel(process.platform) },
});
```

Keep `CommandOrControl+Shift+D`; update its comment to describe both platforms.

- [ ] **Step 4: Verify syntax and tests**

Run: `node --check app/main.js && node --check app/runtime.js && cd app && npm test`

Expected: syntax checks exit 0; 6 tests pass.

- [ ] **Step 5: Verify macOS development launch reaches the control window**

Run: `cd app && npm start`

Expected: Electron opens the overlay and control window, and the control window reports a connected local backend. Close the control window and confirm the Electron and Python child processes exit.

---

### Task 3: Cross-Platform UI Copy and Fonts

**Files:**
- Modify: `app/control.html`
- Modify: `app/overlay.html`

**Interfaces:**
- Consumes: `platform` and `shortcut` query parameters passed by Task 2.
- Produces: `#shortcutHint` text and Windows-compatible font fallback.

- [ ] **Step 1: Add a failing static verification command**

Run:

```bash
rg -n 'Microsoft JhengHei|id="shortcutHint"|URLSearchParams' app/control.html app/overlay.html
```

Expected: no matches and exit code 1.

- [ ] **Step 2: Add Windows font fallbacks**

Use this font stack in both HTML files:

```css
font-family: "PingFang TC", "Microsoft JhengHei", system-ui, sans-serif;
```

- [ ] **Step 3: Make shortcut and reconnect copy platform-aware**

Replace the fixed hint with:

```html
<div id="shortcutHint" class="hint">顯示／隱藏整個彈幕層。</div>
```

At the beginning of the control script, add:

```js
const query = new URLSearchParams(location.search);
const shortcut = query.get('shortcut') ||
  (query.get('platform') === 'darwin' ? 'Cmd+Shift+D' : 'Ctrl+Shift+D');
```

After defining `$`, set:

```js
$('shortcutHint').textContent = `${shortcut} 可隨時顯示／隱藏整個彈幕層。`;
```

Change the sleep comment from macOS-specific wording to:

```js
// 睡眠喚醒後若留下殭屍連線，心跳會強制重新連線。
```

- [ ] **Step 4: Run static and Node verification**

Run:

```bash
rg -n 'Microsoft JhengHei|id="shortcutHint"|URLSearchParams' app/control.html app/overlay.html
cd app && npm test
```

Expected: both HTML files match the font; `control.html` matches the hint and query parser; all Node tests pass.

---

### Task 4: Freeze the Python Backend on Windows

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/requirements-build.txt`
- Create: `build-windows.ps1`

**Interfaces:**
- Consumes: `backend/server.py`, Windows x64 Python 3.11+, and pip.
- Produces: `backend/dist/ptt-backend.exe` with no external Python requirement.

- [ ] **Step 1: Add exact Python requirement files**

```text
# backend/requirements.txt
PyPtt==2.1.3
websockets==16.1
```

```text
# backend/requirements-build.txt
-r requirements.txt
PyInstaller==6.21.0
```

- [ ] **Step 2: Verify the current backend against the direct requirements**

Run:

```bash
backend/.venv/bin/python -c "import PyPtt, websockets; print('backend imports ok')"
backend/.venv/bin/python -m py_compile backend/server.py
```

Expected: `backend imports ok`; compile exits 0.

- [ ] **Step 3: Create the Windows build script preflight and backend build**

Create `build-windows.ps1` with strict failure handling, explicit x64 checks, and explicit workspace paths:

```powershell
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $ProjectRoot 'backend'
$AppDir = Join-Path $ProjectRoot 'app'
$BuildVenv = Join-Path $BackendDir '.venv-build-windows'
$BackendExe = Join-Path $BackendDir 'dist\ptt-backend.exe'
$ReleaseDir = Join-Path $ProjectRoot 'release-windows'

if (-not [Environment]::Is64BitOperatingSystem) {
  throw '只支援 64 位元 Windows 10/11。'
}
if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
  throw '建置電腦需要 64 位元 Python 3.11 以上，並需提供 py 指令。'
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw '建置電腦需要 Node.js 20 以上。'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw '建置電腦找不到 npm。'
}

function Assert-LastExitCode([string] $Action) {
  if ($LASTEXITCODE -ne 0) {
    throw "$Action 失敗（結束碼 $LASTEXITCODE）。"
  }
}

$NodeMajor = [int]((& node -p "process.versions.node.split('.')[0]").Trim())
Assert-LastExitCode '讀取 Node.js 版本'
if ($NodeMajor -lt 20) { throw '建置電腦需要 Node.js 20 以上。' }

Push-Location $BackendDir
try {
  & py -3 -m venv $BuildVenv
  Assert-LastExitCode '建立 Python 虛擬環境'
  $VenvPython = Join-Path $BuildVenv 'Scripts\python.exe'
  & $VenvPython -c "import platform, sys; raise SystemExit(0 if sys.version_info >= (3, 11) and platform.architecture()[0] == '64bit' else 1)"
  Assert-LastExitCode '檢查 Python 3.11+ x64'
  & $VenvPython -m pip install --upgrade pip
  Assert-LastExitCode '更新 pip'
  & $VenvPython -m pip install -r requirements-build.txt
  Assert-LastExitCode '安裝 Python 建置相依'
  & $VenvPython -m PyInstaller `
    --noconfirm --clean --onefile --noconsole `
    --name ptt-backend `
    --distpath (Join-Path $BackendDir 'dist') `
    --workpath (Join-Path $BackendDir 'build\ptt-backend') `
    --specpath (Join-Path $BackendDir 'build') `
    --collect-all PyPtt --collect-all uao `
    (Join-Path $BackendDir 'server.py')
  Assert-LastExitCode '打包 Python 後端'
} finally {
  Pop-Location
}

if (-not (Test-Path $BackendExe)) {
  throw "後端建置失敗，找不到 $BackendExe"
}
Write-Host "後端完成：$BackendExe"
```

- [ ] **Step 4: Run PowerShell syntax parsing on macOS**

If `pwsh` is available, run:

```bash
pwsh -NoProfile -Command '$null = [System.Management.Automation.Language.Parser]::ParseFile("build-windows.ps1", [ref]$null, [ref]$null); "PowerShell parse ok"'
```

Expected: `PowerShell parse ok`. If `pwsh` is unavailable, record that final script execution requires Windows PowerShell.

- [ ] **Step 5: Build and smoke-test the frozen backend on Windows x64**

Run from PowerShell: `powershell -ExecutionPolicy Bypass -File .\build-windows.ps1`

Expected at this task checkpoint: `backend\dist\ptt-backend.exe` exists and the script prints `後端完成` before later Electron steps are added. Launch the EXE and confirm it prints no console window, listens on `127.0.0.1:9737`, and exits when terminated from Task Manager.

---

### Task 5: Package the Portable Electron EXE and ZIP

**Files:**
- Modify: `app/package.json`
- Modify: `app/package-lock.json`
- Modify: `build-windows.ps1`
- Create: `WINDOWS使用說明.txt`

**Interfaces:**
- Consumes: Task 4 `backend/dist/ptt-backend.exe` and Task 2 packaged backend path contract.
- Produces: `release-windows/PTT彈幕-Windows-x64.zip` containing `PTT彈幕.exe` and `WINDOWS使用說明.txt`.

- [ ] **Step 1: Install and lock electron-builder**

Run: `cd app && npm install --save-dev --save-exact electron@33.4.11 electron-builder@26.0.12`

Expected: `package.json` and `package-lock.json` contain exact versions; npm exits 0.

- [ ] **Step 2: Add packaging scripts and electron-builder configuration**

Merge this content into `app/package.json`:

```json
{
  "scripts": {
    "start": "electron .",
    "test": "node --test test/*.test.js",
    "build:win": "electron-builder --win portable --x64"
  },
  "build": {
    "appId": "tw.local.ptt-danmaku",
    "productName": "PTT彈幕",
    "asar": true,
    "directories": {
      "output": "dist"
    },
    "files": [
      "main.js",
      "runtime.js",
      "control.html",
      "overlay.html",
      "package.json"
    ],
    "extraResources": [
      {
        "from": "../backend/dist/ptt-backend.exe",
        "to": "backend/ptt-backend.exe"
      }
    ],
    "win": {
      "target": [
        {
          "target": "portable",
          "arch": ["x64"]
        }
      ],
      "artifactName": "PTT彈幕-Windows-${version}-${arch}.${ext}"
    }
  }
}
```

- [ ] **Step 3: Add recipient-facing Windows instructions**

```text
PTT 彈幕 Windows 版

1. 請先完整解壓縮 ZIP，不要直接在壓縮檔預覽中執行。
2. 雙擊「PTT彈幕.exe」。不需要安裝 Python 或 Node.js。
3. Windows SmartScreen 若顯示未知發行者，請確認檔案來自你信任的 Google Drive 分享者，再選「其他資訊」→「仍要執行」。
4. Ctrl+Shift+D 可顯示或隱藏彈幕。
5. 若彈幕無法蓋住影片，請把播放器改成無邊框或視窗化全螢幕；獨占全螢幕可能阻擋置頂視窗。
6. 若顯示 9737 埠被占用，請關閉其他 PTT 彈幕視窗；仍無法使用時，到工作管理員結束 PTT彈幕或 ptt-backend 後再開。

帳號密碼只會送到本機 127.0.0.1 後端，程式不會儲存。
```

- [ ] **Step 4: Finish the PowerShell Electron and ZIP stages**

Append after the backend check in `build-windows.ps1`:

```powershell
Push-Location $AppDir
try {
  & npm ci
  Assert-LastExitCode '安裝 Electron 相依'
  & npm test
  Assert-LastExitCode '執行 Node.js 測試'
  & npm run build:win
  Assert-LastExitCode '打包 Electron Windows 可攜版'
} finally {
  Pop-Location
}

$PortableExe = Join-Path $AppDir 'dist\PTT彈幕-Windows-0.1.0-x64.exe'
if (-not (Test-Path $PortableExe)) {
  throw "Electron 建置失敗，找不到 $PortableExe"
}

$StageDir = Join-Path $ReleaseDir 'PTT彈幕-Windows-x64'
$ZipPath = Join-Path $ReleaseDir 'PTT彈幕-Windows-x64.zip'
if (Test-Path $StageDir) { Remove-Item -Recurse -Force $StageDir }
if (Test-Path $ZipPath) { Remove-Item -Force $ZipPath }
New-Item -ItemType Directory -Force -Path $StageDir | Out-Null
Copy-Item $PortableExe (Join-Path $StageDir 'PTT彈幕.exe')
Copy-Item (Join-Path $ProjectRoot 'WINDOWS使用說明.txt') $StageDir
Compress-Archive -Path (Join-Path $StageDir '*') -DestinationPath $ZipPath

if (-not (Test-Path $ZipPath)) {
  throw "ZIP 建立失敗：$ZipPath"
}
Write-Host "Windows ZIP 完成：$ZipPath"
```

- [ ] **Step 5: Verify configuration and tests on macOS**

Run:

```bash
node -e "const p=require('./app/package.json'); if(p.build.win.target[0].target!=='portable') process.exit(1); console.log(p.build.extraResources[0].to)"
cd app && npm test
```

Expected: prints `backend/ptt-backend.exe`; all tests pass.

- [ ] **Step 6: Build the complete artifact on Windows x64**

Run from the project root in PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\build-windows.ps1
```

Expected: exits 0 and prints `Windows ZIP 完成`; `release-windows\PTT彈幕-Windows-x64.zip` exists and contains exactly `PTT彈幕.exe` and `WINDOWS使用說明.txt`.

---

### Task 6: Documentation and End-to-End Verification

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 5 build command and artifact path.
- Produces: accurate macOS development, Windows build, delivery, and recipient instructions.

- [ ] **Step 1: Replace platform-specific setup text with separate development and Windows sections**

Add these exact facts to `README.md`:

```markdown
## Windows 可攜版

收件者不需安裝 Python 或 Node.js：解壓 `PTT彈幕-Windows-x64.zip`，再雙擊 `PTT彈幕.exe`。

Windows 成品必須在 Windows 10/11 x64 建置機產生。建置機需先安裝 64 位元 Python 3.11+ 與 Node.js 20+，接著在 PowerShell 執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\build-windows.ps1
```

完成品位於 `release-windows\PTT彈幕-Windows-x64.zip`，可上傳 Google Drive 後分享連結。

未簽章版本第一次執行可能出現 SmartScreen「未知發行者」提示。Windows 獨占全螢幕也可能阻擋置頂彈幕，建議使用無邊框或視窗化全螢幕。
```

Keep the existing macOS `npm start` flow, change dependency recreation to platform-specific `.venv/bin` and `.venv\\Scripts` examples, and document `Ctrl+Shift+D` alongside `Cmd+Shift+D`.

- [ ] **Step 2: Run the full macOS-safe verification suite**

Run:

```bash
node --check app/main.js
node --check app/runtime.js
cd app && npm test
cd .. && backend/.venv/bin/python -m py_compile backend/server.py
node -e "JSON.parse(require('fs').readFileSync('app/package.json')); JSON.parse(require('fs').readFileSync('app/package-lock.json')); console.log('JSON ok')"
rg -n 'Windows 可攜版|build-windows.ps1|Google Drive|Ctrl\+Shift\+D' README.md WINDOWS使用說明.txt
```

Expected: all commands exit 0; Node tests pass; output includes `JSON ok` and all Windows documentation terms.

- [ ] **Step 3: Perform the clean Windows recipient smoke test**

On a Windows 10/11 x64 environment without Python and Node.js installed:

1. Download the Google Drive ZIP into a path containing spaces and Chinese characters.
2. Extract it fully and launch `PTT彈幕.exe` without administrator rights.
3. Confirm the control panel connects to the backend.
4. Click `🎾 測試彈幕` and confirm comments animate across the overlay.
5. Confirm `Ctrl+Shift+D` hides and shows the overlay.
6. Log into PTT, add an article URL, and confirm new comments arrive.
7. Close the control panel; verify Task Manager has no remaining `PTT彈幕` or `ptt-backend` process.
8. Start two copies; verify the second copy exits without opening a second backend.

Expected: all eight checks pass. Record Windows edition, architecture, ZIP byte size, and SHA-256 using:

```powershell
Get-FileHash .\release-windows\PTT彈幕-Windows-x64.zip -Algorithm SHA256
```

- [ ] **Step 4: Final completion gate**

Do not claim the Windows binary itself is verified until Task 6 Step 3 is run on Windows x64. If only macOS-safe checks are available, report the source/build pipeline as complete and explicitly list the Windows artifact build and smoke test as outstanding.
