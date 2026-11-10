'use strict';
/* global Lanes, danmaku */
(function () {
  const stage = document.getElementById('stage');
  let settings = {
    fontSize: 30, speed: 170, opacity: 1, areaRatio: 0.7,
    showBoo: true, showArrow: true, showUser: true, blockWords: '',
  };
  let blockWords = [];
  let lanes = [];        // 每條車道何時可以再放下一則(performance.now 時間)
  const queue = [];      // 車道全滿時先排隊,不讓彈幕互相重疊

  function applySettings(next) {
    settings = { ...settings, ...next };
    blockWords = Lanes.parseBlockWords(settings.blockWords);
    const count = Lanes.laneCount(window.innerHeight, settings.fontSize, settings.areaRatio);
    lanes = Array.from({ length: count }, (_, i) => lanes[i] || 0);
  }

  function build(msg) {
    const el = document.createElement('div');
    el.className = 'dm';
    el.style.fontSize = settings.fontSize + 'px';
    el.style.opacity = settings.opacity;

    const sym = document.createElement('span');
    sym.className = 'sym ' + (msg.tag === '推' ? 'push' : msg.tag === '噓' ? 'boo' : 'arrow');
    sym.textContent = msg.tag;
    el.appendChild(sym);

    if (settings.showUser) {
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = msg.user;
      who.style.color = msg.color || '#4fc3f7';
      el.appendChild(who);
    }
    const txt = document.createElement('span');
    txt.textContent = msg.content;
    el.appendChild(txt);
    return el;
  }

  function launch(msg, lane) {
    const el = build(msg);
    stage.appendChild(el);
    const width = el.offsetWidth;
    const total = window.innerWidth + width;
    el.style.top = (lane * settings.fontSize * 1.5 + 10) + 'px';
    lanes[lane] = Lanes.laneBusyUntil(performance.now(), width, settings.speed);
    el.animate(
      [{ transform: 'translateX(0)' }, { transform: `translateX(-${total}px)` }],
      { duration: (total / settings.speed) * 1000, easing: 'linear' }
    ).onfinish = () => el.remove();
  }

  function drain() {
    while (queue.length) {
      const lane = Lanes.pickLane(lanes, performance.now());
      if (lane < 0) return;
      launch(queue.shift(), lane);
    }
  }

  function onComment(msg) {
    if (!msg.demo && !Lanes.shouldShow(msg, settings, blockWords)) return;
    Lanes.pushQueue(queue, msg);
    drain();
  }

  setInterval(drain, 120);
  window.addEventListener('resize', () => applySettings({}));

  applySettings({});
  danmaku.on('comment', onComment);
  danmaku.on('settings', applySettings);
  danmaku.overlayInit().then((init) => applySettings(init.settings));
})();
