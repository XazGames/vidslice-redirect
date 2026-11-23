/* VidSlice - a tiny mark that drifts and gently avoids the pointer. */
(function () {
  'use strict';

  function init() {
    if (document.querySelector('.vs-mini')) return;

    var mini = document.createElement('div');
    mini.className = 'vs-mini';
    mini.setAttribute('aria-hidden', 'true');
    mini.textContent = 'V';
    document.body.appendChild(mini);

    var pointer = { x: -9999, y: -9999, active: false };
    var pos = null;
    var idleTimer = null;

    window.addEventListener('pointermove', function (event) {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
      mini.classList.add('is-awake');
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(function () { mini.classList.remove('is-awake'); }, 900);
    }, { passive: true });

    window.addEventListener('pointerleave', function () {
      pointer.active = false;
      mini.classList.remove('is-awake');
    });

    function tick() {
      var now = Date.now() / 1000;
      var baseX = Math.max(54, window.innerWidth * 0.14);
      var baseY = Math.max(96, window.innerHeight * 0.2);
      var x = baseX + Math.sin(now * 0.7) * 5;
      var y = baseY + Math.cos(now * 0.55) * 4;

      if (pointer.active) {
        var dx = x - pointer.x;
        var dy = y - pointer.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist < 190) {
          var force = 1 - dist / 190;
          var push = force * force * 26;
          x += dx / dist * push;
          y += dy / dist * push;
        }
      }

      if (!pos) pos = { x: x, y: y };
      pos.x += (x - pos.x) * 0.08;
      pos.y += (y - pos.y) * 0.08;
      mini.style.transform = 'translate3d(' + pos.x.toFixed(1) + 'px,' + pos.y.toFixed(1) + 'px,0)';
    }

    tick();
    setInterval(tick, 32);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
