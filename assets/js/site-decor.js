/* VidSlice - the real interface gently leans away from the pointer. */
(function () {
  'use strict';

  function init() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var targets = Array.prototype.slice.call(document.querySelectorAll('.shell, .topbar, .studio'));
    if (!targets.length) return;

    var pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2, active: false };
    var current = { x: 0, y: 0 };
    var last = performance.now();

    window.addEventListener('pointermove', function (event) {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
    }, { passive: true });

    window.addEventListener('pointerleave', function () {
      pointer.active = false;
    });

    window.addEventListener('resize', function () {
      if (!pointer.active) {
        pointer.x = window.innerWidth / 2;
        pointer.y = window.innerHeight / 2;
      }
    });

    document.addEventListener('visibilitychange', function () {
      last = performance.now();
    });

    function update(now) {
      var dt = Math.min(now - last, 64);
      last = now;
      var nx = 0;
      var ny = 0;

      if (pointer.active) {
        nx = (pointer.x / Math.max(window.innerWidth, 1) - 0.5) * 2;
        ny = (pointer.y / Math.max(window.innerHeight, 1) - 0.5) * 2;
      }

      var targetX = -nx * 5;
      var targetY = -ny * 5;
      var ease = 1 - Math.exp(-dt / 70);
      current.x += (targetX - current.x) * ease;
      current.y += (targetY - current.y) * ease;

      var value = current.x.toFixed(2) + 'px ' + current.y.toFixed(2) + 'px';
      for (var i = 0; i < targets.length; i++) {
        targets[i].style.translate = value;
      }
    }

    var rafSeen = false;

    function frame(now) {
      rafSeen = true;
      update(now);
      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
    setInterval(function () {
      if (!rafSeen) update(performance.now());
    }, 16);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
