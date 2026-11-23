/* VidSlice - a tiny mark that stays just behind the pointer. */
(function () {
  'use strict';

  function init() {
    if (document.querySelector('.vs-mini')) return;

    var mini = document.createElement('div');
    mini.className = 'vs-mini';
    mini.setAttribute('aria-hidden', 'true');
    mini.textContent = 'V';
    document.body.appendChild(mini);

    var pointer = { x: 0, y: 0, active: false };
    var last = { x: 0, y: 0, time: 0 };
    var velocity = { x: 0, y: 0 };
    var pos = null;
    var idleTimer = null;

    window.addEventListener('pointermove', function (event) {
      var now = Date.now();
      if (last.time) {
        var dt = now - last.time;
        if (dt > 0) {
          velocity.x = (event.clientX - last.x) / dt * 16;
          velocity.y = (event.clientY - last.y) / dt * 16;
        }
      }
      last.x = event.clientX;
      last.y = event.clientY;
      last.time = now;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
      mini.classList.add('is-awake');
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(function () { mini.classList.remove('is-awake'); }, 900);
    }, { passive: true });

    window.addEventListener('pointerleave', function () {
      pointer.active = false;
      velocity.x = 0;
      velocity.y = 0;
      mini.classList.remove('is-awake');
    });

    function tick() {
      var now = Date.now() / 1000;
      var driftX = Math.sin(now * 0.8) * 3;
      var driftY = Math.cos(now * 0.6) * 3;
      var x;
      var y;

      if (pointer.active) {
        var speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
        var offX;
        var offY;
        if (speed > 0.5) {
          offX = -velocity.x / speed * 38;
          offY = -velocity.y / speed * 38;
        } else {
          offX = 44;
          offY = 30;
        }
        x = pointer.x + offX + driftX;
        y = pointer.y + offY + driftY;
        velocity.x *= 0.88;
        velocity.y *= 0.88;
      } else {
        x = Math.max(54, window.innerWidth * 0.14) + driftX;
        y = Math.max(96, window.innerHeight * 0.2) + driftY;
      }

      x = Math.min(Math.max(x, 14), window.innerWidth - 32);
      y = Math.min(Math.max(y, 14), window.innerHeight - 32);

      if (!pos) pos = { x: x, y: y };
      pos.x += (x - pos.x) * 0.12;
      pos.y += (y - pos.y) * 0.12;
      mini.style.transform = 'translate3d(' + pos.x.toFixed(1) + 'px,' + pos.y.toFixed(1) + 'px,0)';
    }

    tick();
    setInterval(tick, 32);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
