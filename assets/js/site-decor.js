/* VidSlice - a tiny GUI menu that shyly drifts away from the pointer. */
(function () {
  'use strict';

  function init() {
    if (document.querySelector('.vs-gui-menu')) return;

    var menu = document.createElement('div');
    menu.className = 'vs-gui-menu';
    menu.setAttribute('aria-hidden', 'true');
    menu.innerHTML = '<span></span><span></span><span></span>';
    document.body.appendChild(menu);

    var pointer = { x: -9999, y: -9999, active: false };
    var pos = null;
    var idleTimer = null;

    window.addEventListener('pointermove', function (event) {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
      menu.classList.add('is-awake');
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(function () { menu.classList.remove('is-awake'); }, 900);
    }, { passive: true });

    window.addEventListener('pointerleave', function () {
      pointer.active = false;
      menu.classList.remove('is-awake');
    });

    function tick() {
      var now = Date.now() / 1000;
      var baseX = Math.max(58, window.innerWidth * 0.08);
      var baseY = Math.max(150, window.innerHeight * 0.28);
      var x = baseX + Math.sin(now * 0.55) * 4;
      var y = baseY + Math.cos(now * 0.42) * 3;

      if (pointer.active) {
        var dx = x - pointer.x;
        var dy = y - pointer.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist < 180) {
          var force = 1 - dist / 180;
          var push = force * force * 30;
          x += dx / dist * push;
          y += dy / dist * push;
        }
      }

      x = Math.min(Math.max(x, 14), window.innerWidth - 106);
      y = Math.min(Math.max(y, 14), window.innerHeight - 76);

      if (!pos) pos = { x: x, y: y };
      pos.x += (x - pos.x) * 0.08;
      pos.y += (y - pos.y) * 0.08;
      menu.style.transform = 'translate3d(' + pos.x.toFixed(1) + 'px,' + pos.y.toFixed(1) + 'px,0)';
    }

    tick();
    setInterval(tick, 32);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
