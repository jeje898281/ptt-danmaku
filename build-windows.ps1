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
  throw '建置電腦需要 Node.js 20，或 Node.js 22 以上版本。'
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
if ($NodeMajor -lt 20 -or $NodeMajor -eq 21) {
  throw '建置電腦需要 Node.js 20，或 Node.js 22 以上版本。'
}

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

$AppPackage = Get-Content (Join-Path $AppDir 'package.json') -Raw | ConvertFrom-Json
$PortableExe = Join-Path $AppDir "dist\PTT彈幕-Windows-$($AppPackage.version)-x64.exe"
if (-not (Test-Path $PortableExe)) {
  throw "Electron 建置失敗，找不到 $PortableExe"
}

$StageDir = Join-Path $ReleaseDir 'PTT彈幕-Windows-x64'
$ZipPath = Join-Path $ReleaseDir 'PTT彈幕-Windows-x64.zip'
if (Test-Path $StageDir) {
  Remove-Item -Recurse -Force $StageDir
}
if (Test-Path $ZipPath) {
  Remove-Item -Force $ZipPath
}
New-Item -ItemType Directory -Force -Path $StageDir | Out-Null
Copy-Item $PortableExe (Join-Path $StageDir 'PTT彈幕.exe')
Copy-Item (Join-Path $ProjectRoot 'WINDOWS使用說明.txt') $StageDir
Compress-Archive -Path (Join-Path $StageDir '*') -DestinationPath $ZipPath

if (-not (Test-Path $ZipPath)) {
  throw "ZIP 建立失敗：$ZipPath"
}
Write-Host "Windows ZIP 完成：$ZipPath"
