/* VidSlice - the real interface gently leans away from the pointer. */
(function () {
  'use strict';

  function init() {
    var root = document.documentElement;
    var pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2, active: false };
    var current = { x: 0, y: 0 };

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

    function tick() {
      var nx = 0;
      var ny = 0;
      if (pointer.active) {
        nx = (pointer.x / Math.max(window.innerWidth, 1) - 0.5) * 2;
        ny = (pointer.y / Math.max(window.innerHeight, 1) - 0.5) * 2;
      }
      var targetX = -nx * 5;
      var targetY = -ny * 5;
      current.x += (targetX - current.x) * 0.08;
      current.y += (targetY - current.y) * 0.08;
      root.style.setProperty('--gui-x', current.x.toFixed(2) + 'px');
      root.style.setProperty('--gui-y', current.y.toFixed(2) + 'px');
    }

    tick();
    setInterval(tick, 32);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
