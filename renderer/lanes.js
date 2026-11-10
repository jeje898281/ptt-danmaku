'use strict';
// 彈幕車道與過濾邏輯。純函式,瀏覽器與 Node 測試共用。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Lanes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const LANE_GAP_MS = 350;   // 同一車道兩則彈幕之間至少留的間隔
  const MAX_QUEUE = 80;      // 車道全滿時最多排隊幾則,再多就丟掉最舊的

  function laneCount(viewHeight, fontSize, areaRatio) {
    return Math.max(1, Math.floor((viewHeight * areaRatio) / (fontSize * 1.5)));
  }

  /** 回傳第一條有空的車道編號;全滿回傳 -1。 */
  function pickLane(lanes, now) {
    for (let i = 0; i < lanes.length; i++) if (lanes[i] <= now) return i;
    return -1;
  }

  /** 這則彈幕的尾巴完全進入畫面後,車道才能再用。 */
  function laneBusyUntil(now, widthPx, speed) {
    return now + (widthPx / speed) * 1000 + LANE_GAP_MS;
  }

  function parseBlockWords(text) {
    return String(text || '').split(/[\s,，、]+/).map((w) => w.trim().toLowerCase()).filter(Boolean);
  }

  function shouldShow(msg, settings, blockWords) {
    if (msg.tag === '噓' && !settings.showBoo) return false;
    if (msg.tag === '→' && !settings.showArrow) return false;
    if (!msg.content) return false;
    const haystack = `${msg.user} ${msg.content}`.toLowerCase();
    return !blockWords.some((w) => haystack.includes(w));
  }

  function pushQueue(queue, item) {
    queue.push(item);
    while (queue.length > MAX_QUEUE) queue.shift();
    return queue;
  }

  return { LANE_GAP_MS, MAX_QUEUE, laneCount, pickLane, laneBusyUntil, parseBlockWords, shouldShow, pushQueue };
});
