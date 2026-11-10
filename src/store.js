'use strict';
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_SETTINGS = Object.freeze({
  fontSize: 30,       // px
  speed: 170,         // px/s
  opacity: 1,         // 0.3 ~ 1
  areaRatio: 0.7,     // 彈幕使用畫面上方多少比例
  showBoo: true,
  showArrow: true,
  showUser: true,     // 是否顯示推文者 ID
  blockWords: '',     // 以逗號或空白分隔;含有這些字的推文不顯示
  displayId: null,    // 彈幕顯示在哪個螢幕;null = 主螢幕
});

const LIMITS = {
  fontSize: [16, 72],
  speed: [60, 500],
  opacity: [0.2, 1],
  areaRatio: [0.1, 1],
};

/** 只留下認得的欄位並把數值夾在合理範圍內。 */
function sanitizeSettings(input, base = DEFAULT_SETTINGS) {
  const out = { ...base };
  if (!input || typeof input !== 'object') return out;
  for (const [key, [min, max]] of Object.entries(LIMITS)) {
    const v = Number(input[key]);
    if (key in input && Number.isFinite(v)) out[key] = Math.min(max, Math.max(min, v));
  }
  for (const key of ['showBoo', 'showArrow', 'showUser']) {
    if (typeof input[key] === 'boolean') out[key] = input[key];
  }
  if (typeof input.blockWords === 'string') out.blockWords = input.blockWords.slice(0, 500);
  if ('displayId' in input) {
    out.displayId = Number.isFinite(Number(input.displayId)) && input.displayId !== null
      ? Number(input.displayId) : null;
  }
  return out;
}

class Store {
  constructor(file) {
    this.file = file;
    this.data = { settings: { ...DEFAULT_SETTINGS }, articles: [], recentBoards: [], overlayVisible: true };
    this._timer = null;
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data.settings = sanitizeSettings(raw.settings);
      if (Array.isArray(raw.articles)) {
        this.data.articles = raw.articles.filter((u) => typeof u === 'string').slice(0, 20);
      }
      if (Array.isArray(raw.recentBoards)) {
        this.data.recentBoards = raw.recentBoards.filter((b) => typeof b === 'string').slice(0, 8);
      }
      if (typeof raw.overlayVisible === 'boolean') this.data.overlayVisible = raw.overlayVisible;
    } catch {
      // 第一次啟動或檔案壞掉:用預設值
    }
  }

  save() {
    clearTimeout(this._timer);
    this._timer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    clearTimeout(this._timer);
    this._timer = null;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('儲存設定失敗', err);
    }
  }
}

module.exports = { Store, DEFAULT_SETTINGS, sanitizeSettings };
