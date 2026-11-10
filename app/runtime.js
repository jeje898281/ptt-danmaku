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
