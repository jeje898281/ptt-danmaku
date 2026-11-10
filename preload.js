'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const EVENTS = ['comment', 'articles', 'settings', 'overlay-visible', 'displays'];

contextBridge.exposeInMainWorld('danmaku', {
  init: () => ipcRenderer.invoke('app:init'),
  overlayInit: () => ipcRenderer.invoke('overlay:init'),
  addArticle: (input) => ipcRenderer.invoke('articles:add', input),
  removeArticle: (url) => ipcRenderer.invoke('articles:remove', url),
  listBoard: (board) => ipcRenderer.invoke('board:list', board),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  setOverlayVisible: (visible) => ipcRenderer.invoke('overlay:set-visible', visible),
  demo: () => ipcRenderer.invoke('demo'),
  clipboardArticle: () => ipcRenderer.invoke('clipboard:article'),
  on: (event, handler) => {
    if (!EVENTS.includes(event)) return;
    ipcRenderer.on(event, (_e, payload) => handler(payload));
  },
});
