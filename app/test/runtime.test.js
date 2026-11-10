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
