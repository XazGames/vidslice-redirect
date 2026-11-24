/* VidSlice - pure client-side tools. One file, one style, no hidden routes. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var dotColor = '255, 255, 255';
  var busyDepth = 0;

  function beginWork() {
    busyDepth++;
  }

  function endWork() {
    busyDepth = Math.max(0, busyDepth - 1);
  }

  window.addEventListener('beforeunload', function (event) {
    if (!busyDepth) return;
    event.preventDefault();
    event.returnValue = 'Идёт обработка. Действительно обновить страницу?';
    return event.returnValue;
  });

  function formatBytes(bytes) {
    if (!bytes || bytes < 0) return '-';
    var units = ['Б', 'КБ', 'МБ', 'ГБ'];
    var i = 0;
    var value = bytes;
    while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
    return (i === 0 ? Math.round(value) : value.toFixed(value >= 100 ? 0 : 1)) + ' ' + units[i];
  }

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    var ms = Math.floor((seconds % 1) * 100);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + '.' + String(ms).padStart(2, '0');
  }

  function extFor(type) {
    if (type === 'image/png') return 'png';
    if (type === 'image/webp') return 'webp';
    return 'jpg';
  }

  function formatLabel(type) {
    if (type === 'image/png') return 'PNG';
    if (type === 'image/webp') return 'WebP';
    if (type === 'image/jpeg') return 'JPEG';
    return 'выбранный формат';
  }

  function showError(node, message) {
    if (!node) return;
    node.textContent = message || '';
    node.classList.toggle('is-active', Boolean(message));
  }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  var crcTable = null;

  function crc32(bytes) {
    if (!crcTable) {
      crcTable = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        crcTable[n] = c >>> 0;
      }
    }
    var crc = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  async function makeZip(entries) {
    var encoder = new TextEncoder();
    var parts = [];
    var central = [];
    var offset = 0;
    var used = {};

    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var name = entry.name;
      if (used[name]) {
        var dot = name.lastIndexOf('.');
        var base = dot > 0 ? name.slice(0, dot) : name;
        var ext = dot > 0 ? name.slice(dot) : '';
        name = base + '-' + (used[name] + 1) + ext;
      }
      used[entry.name] = (used[entry.name] || 0) + 1;

      var nameBytes = encoder.encode(name);
      var data = new Uint8Array(await entry.blob.arrayBuffer());
      var crc = crc32(data);
      var local = new Uint8Array(30 + nameBytes.length);
      var lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, 0, true);
      lv.setUint16(12, 33, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      local.set(nameBytes, 30);

      var record = new Uint8Array(46 + nameBytes.length);
      var rv = new DataView(record.buffer);
      rv.setUint32(0, 0x02014b50, true);
      rv.setUint16(4, 20, true);
      rv.setUint16(6, 20, true);
      rv.setUint16(8, 0x0800, true);
      rv.setUint16(10, 0, true);
      rv.setUint16(12, 0, true);
      rv.setUint16(14, 33, true);
      rv.setUint32(16, crc, true);
      rv.setUint32(20, data.length, true);
      rv.setUint32(24, data.length, true);
      rv.setUint16(28, nameBytes.length, true);
      rv.setUint32(42, offset, true);
      record.set(nameBytes, 46);

      parts.push(local, data);
      central.push(record);
      offset += local.length + data.length;
    }

    var centralSize = 0;
    for (var j = 0; j < central.length; j++) centralSize += central[j].length;
    var end = new Uint8Array(22);
    var ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, central.length, true);
    ev.setUint16(10, central.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [end]), { type: 'application/zip' });
  }

  /* ---------- shared UI helpers ---------- */

  var toastStack = null;

  function toast(title, sub, kind) {
    if (!toastStack) {
      toastStack = document.createElement('div');
      toastStack.className = 'toast-stack';
      toastStack.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastStack);
    }
    var node = document.createElement('div');
    node.className = 'toast' + (kind === 'error' ? ' toast--error' : '');
    node.setAttribute('role', 'status');
    var icon = kind === 'error'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5 10-11"/></svg>';
    node.innerHTML = '<span class="toast__icon">' + icon + '</span>' +
      '<span class="toast__body"><span class="toast__title"></span><span class="toast__sub"></span></span>' +
      '<i class="toast__life"></i>';
    node.querySelector('.toast__title').textContent = title;
    var subNode = node.querySelector('.toast__sub');
    if (sub) subNode.textContent = sub; else subNode.remove();
    toastStack.appendChild(node);
    while (toastStack.children.length > 3) toastStack.firstChild.remove();
    var leaving = false;
    function dismiss() {
      if (leaving) return;
      leaving = true;
      node.classList.add('is-leaving');
      setTimeout(function () { node.remove(); }, 320);
    }
    node.addEventListener('click', dismiss);
    setTimeout(dismiss, 4200);
  }

  function reveal(node) {
    if (!node) return;
    node.classList.remove('reveal');
    void node.offsetWidth;
    node.classList.add('reveal');
  }

  function animatedClose(wrap) {
    if (!wrap.classList.contains('is-open') || wrap.classList.contains('is-closing')) return;
    wrap.classList.add('is-closing');
    setTimeout(function () { wrap.classList.remove('is-open', 'is-closing'); }, 230);
  }

  var scrollTimer = null;

  function scrollToNode(node, delay) {
    if (!node) return;
    setTimeout(function () {
      var doc = document.scrollingElement || document.documentElement;
      var rect = node.getBoundingClientRect();
      var max = Math.max(0, doc.scrollHeight - window.innerHeight);
      var target = Math.max(0, Math.min(max, window.pageYOffset + rect.top - (window.innerHeight - rect.height) / 2));
      var start = window.pageYOffset;
      var distance = target - start;
      if (Math.abs(distance) < 2) return;
      if (scrollTimer) clearInterval(scrollTimer);
      var started = performance.now();
      scrollTimer = setInterval(function () {
        var p = Math.min(1, (performance.now() - started) / 650);
        var eased = 1 - Math.pow(1 - p, 3);
        window.scrollTo(0, start + distance * eased);
        if (p >= 1) {
          clearInterval(scrollTimer);
          scrollTimer = null;
        }
      }, 16);
    }, delay || 0);
  }

  function makePicker(cfg) {
    var wrap = document.createElement('div');
    wrap.className = 'picker';
    wrap.id = cfg.id;
    wrap.innerHTML = [
      '<div class="picker__box" role="dialog" aria-modal="true" aria-labelledby="' + cfg.id + 'Title">',
      '  <div class="picker__head">',
      '    <h2 id="' + cfg.id + 'Title">' + cfg.title + '</h2>',
      '    <button class="modal__close" type="button" data-picker-close aria-label="Закрыть">&times;</button>',
      '  </div>',
      '  <label class="drop drop--picker" data-picker-drop>',
      '    <input type="file" ' + (cfg.multiple ? 'multiple ' : '') + 'accept="' + cfg.accept + '" data-picker-input hidden>',
      '    <div>',
      '      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M4 15.5v2.2A2.3 2.3 0 0 0 6.3 20h11.4a2.3 2.3 0 0 0 2.3-2.3v-2.2"/></svg>',
      '      <strong>' + cfg.title + '</strong><span>' + cfg.hint + '</span>',
      '    </div>',
      '  </label>',
      '  <div class="picker__foot"><button class="btn" type="button" data-picker-close>Отмена</button></div>',
      '</div>'
    ].join('');
    document.body.appendChild(wrap);

    var input = wrap.querySelector('[data-picker-input]');
    var drop = wrap.querySelector('[data-picker-drop]');

    function close() { animatedClose(wrap); }
    function take(files) {
      var list = files && Array.prototype.slice.call(files);
      if (!list || !list.length) return;
      cfg.onFiles(list);
      close();
      input.value = '';
    }

    input.addEventListener('change', function () { take(input.files); });
    ['dragenter', 'dragover'].forEach(function (type) {
      drop.addEventListener(type, function (e) { e.preventDefault(); drop.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (type) {
      drop.addEventListener(type, function (e) { e.preventDefault(); drop.classList.remove('is-over'); });
    });
    drop.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files) take(e.dataTransfer.files);
    });
    wrap.querySelectorAll('[data-picker-close]').forEach(function (node) {
      node.addEventListener('click', close);
    });
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && wrap.classList.contains('is-open')) close();
    });

    return {
      open: function () { wrap.classList.remove('is-closing'); wrap.classList.add('is-open'); input.focus(); },
      close: close
    };
  }

  function initCardTilt() {
    var cards = document.querySelectorAll('.card');
    if (!cards.length) return;
    cards.forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var px = (e.clientX - r.left) / r.width;
        var py = (e.clientY - r.top) / r.height;
        var rx = (0.5 - py) * 11;
        var ry = (px - 0.5) * 13;
        card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
        card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
        card.style.transform = 'perspective(900px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg) translateY(-8px) scale(1.015)';
      }, { passive: true });
      card.addEventListener('pointerleave', function () {
        card.style.transform = '';
        card.style.removeProperty('--mx');
        card.style.removeProperty('--my');
      });
    });
  }

  function openHandoffDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('IndexedDB недоступен')); return; }
      var request = indexedDB.open('vidslice-handoff', 1);
      request.onupgradeneeded = function () {
        if (!request.result.objectStoreNames.contains('pending')) request.result.createObjectStore('pending');
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  function saveHandoff(data) {
    return openHandoffDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('pending', 'readwrite');
        tx.objectStore('pending').put(data, 'video');
        tx.oncomplete = function () { db.close(); resolve(); };
        tx.onerror = function () { db.close(); reject(tx.error); };
      });
    });
  }

  /* ---------- shared cursor field ---------- */

  function updateDotColor() {
    var value = getComputedStyle(document.documentElement).getPropertyValue('--dot-color').trim();
    if (value) dotColor = value;
  }

  function initCursorField() {
    var glow = document.querySelector('.cursor-glow');
    var canvas = document.querySelector('.dot-field');
    if (!glow && !canvas) return;

    var pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    var current = { x: pointer.x, y: pointer.y };
    var dots = [];
    var comets = [];
    var nextComet = 600;
    var lastPointerComet = 0;
    var lastFrame = 0;
    var ctx = canvas ? canvas.getContext('2d') : null;
    var width = 0;
    var height = 0;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var grabbing = false;
    var grabRadius = 170;

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      if (canvas) {
        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      var count = Math.max(30, Math.min(90, Math.floor((width * height) / 22000)));
      dots = [];
      comets = [];
      grabbing = false;
      for (var i = 0; i < count; i++) {
        dots.push({
          x: Math.random() * width,
          y: Math.random() * height,
          ox: 0,
          oy: 0,
          vx: 0,
          vy: 0,
          r: 0.6 + Math.random() * 1.4,
          phase: Math.random() * Math.PI * 2,
          captured: 0
        });
      }
      draw(0);
    }

    function spawnComet(time, x, y, dx, dy, fromPointer) {
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / len;
      var uy = dy / len;
      if (!fromPointer) {
        var fromLeft = Math.random() < 0.5;
        x = fromLeft ? -60 : width + 60;
        y = Math.random() * height * 0.8;
        ux = (fromLeft ? 1 : -1) * (0.75 + Math.random() * 0.2);
        uy = 0.35 + Math.random() * 0.3;
        len = Math.sqrt(ux * ux + uy * uy);
        ux /= len;
        uy /= len;
      }
      var speed = fromPointer ? 0.28 + Math.random() * 0.22 : 0.22 + Math.random() * 0.16;
      comets.push({
        x: x,
        y: y,
        vx: ux * speed,
        vy: uy * speed,
        age: 0,
        ttl: fromPointer ? 900 + Math.random() * 500 : 1700 + Math.random() * 900,
        tail: 50 + Math.random() * 70,
        w: 1.1 + Math.random() * 1.3
      });
    }

    function draw(time, dt) {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      var dtSec = dt ? dt / 1000 : 0.016;
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        var drift = Math.sin(time / 900 + d.phase) * 3;
        var homeX = d.x;
        var homeY = d.y + drift;
        var dx = pointer.x - homeX;
        var dy = pointer.y - homeY;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var hover = Math.max(0, 1 - dist / 260);
        var px = homeX;
        var py = homeY;
        var radius = d.r + hover * 1.5;
        var alpha = 0.18 + hover * 0.45;

        if (grabbing && dist < grabRadius) {
          var pull = 1 - dist / grabRadius;
          var targetX = pointer.x - homeX + Math.cos(d.phase * 2.1) * (9 + pull * 14);
          var targetY = pointer.y - homeY - drift + Math.sin(d.phase * 2.7) * (9 + pull * 14);
          d.captured = Math.min(1, d.captured + dtSec * (1.8 + pull * 1.6));
          var ease = 1 - Math.exp(-dtSec * (7 + pull * 9));
          d.ox += (targetX - d.ox) * ease;
          d.oy += (targetY - d.oy) * ease;
          d.vx *= 0.72;
          d.vy *= 0.72;
          px = homeX + d.ox;
          py = homeY + d.oy;
          radius = d.r + 1.8 + pull * 2.4;
          alpha = 0.45 + pull * 0.5;
        } else {
          var pull = hover * hover * 26;
          var hoverX = (dx / dist) * pull;
          var hoverY = (dy / dist) * pull;
          var released = d.captured > 0.01 || Math.abs(d.ox) > 0.6 || Math.abs(d.oy) > 0.6 || Math.abs(d.vx) > 1.5 || Math.abs(d.vy) > 1.5;
          if (released) {
            d.captured = Math.max(0, d.captured - dtSec * 2.2);
            var spring = d.captured > 0 ? 20 : 44;
            var damping = Math.exp(-dtSec * (d.captured > 0 ? 3.2 : 7.5));
            d.vx += (-d.ox * spring - d.vx * 7.5) * dtSec;
            d.vy += (-d.oy * spring - d.vy * 7.5) * dtSec;
            d.vx *= damping;
            d.vy *= damping;
            d.ox += d.vx * dtSec;
            d.oy += d.vy * dtSec;
            if (d.captured <= 0.01 && Math.abs(d.ox) < 0.6 && Math.abs(d.oy) < 0.6 && Math.abs(d.vx) < 1.5 && Math.abs(d.vy) < 1.5) {
              d.ox = 0; d.oy = 0; d.vx = 0; d.vy = 0; d.captured = 0;
            }
          }
          px = homeX + d.ox + hoverX;
          py = homeY + d.oy + hoverY;
          if (d.ox || d.oy) {
            radius = d.r + 0.8 + Math.min(2.2, Math.sqrt(d.vx * d.vx + d.vy * d.vy) / 140);
            alpha = 0.28 + Math.min(0.55, Math.sqrt(d.ox * d.ox + d.oy * d.oy) / 80);
          }
        }

        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + dotColor + ',' + alpha + ')';
        ctx.fill();
      }

      if (dt) {
        if (time > nextComet) {
          if (comets.length < 6) spawnComet(time, 0, 0, 1, 0, false);
          nextComet = time + 900 + Math.random() * 1400;
        }
        for (var c = comets.length - 1; c >= 0; c--) {
          var comet = comets[c];
          comet.age += dt;
          comet.x += comet.vx * dt;
          comet.y += comet.vy * dt;
          if (comet.age >= comet.ttl || comet.x < -220 || comet.x > width + 220 || comet.y < -220 || comet.y > height + 220) {
            comets.splice(c, 1);
          }
        }
      }

      for (var j = 0; j < comets.length; j++) {
        var k = comets[j];
        var alpha = Math.min(1, k.age / 180, (k.ttl - k.age) / 500);
        if (alpha <= 0) continue;
        var sp = Math.sqrt(k.vx * k.vx + k.vy * k.vy) || 1;
        var tx = k.x - (k.vx / sp) * k.tail;
        var ty = k.y - (k.vy / sp) * k.tail;
        var grad = ctx.createLinearGradient(tx, ty, k.x, k.y);
        grad.addColorStop(0, 'rgba(' + dotColor + ',0)');
        grad.addColorStop(0.65, 'rgba(' + dotColor + ',' + (0.1 * alpha) + ')');
        grad.addColorStop(1, 'rgba(' + dotColor + ',' + (0.85 * alpha) + ')');
        ctx.strokeStyle = grad;
        ctx.lineWidth = k.w;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(k.x, k.y);
        ctx.stroke();
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(' + dotColor + ',' + (0.5 * alpha) + ')';
        ctx.beginPath();
        ctx.arc(k.x, k.y, k.w * 1.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + dotColor + ',' + (0.9 * alpha) + ')';
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    function frame(time) {
      var dt = lastFrame ? Math.min(time - lastFrame, 50) : 16;
      lastFrame = time;
      current.x += (pointer.x - current.x) * 0.12;
      current.y += (pointer.y - current.y) * 0.12;
      if (glow) glow.style.transform = 'translate3d(' + current.x + 'px,' + current.y + 'px,0)';
      draw(time, dt);
      requestAnimationFrame(frame);
    }

    function releaseDots() {
      if (!grabbing) return;
      grabbing = false;
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        if (d.captured < 0.02 && Math.abs(d.ox) < 0.2 && Math.abs(d.oy) < 0.2) continue;
        var angle = d.phase * 4.17 + Math.random() * 0.8;
        var speed = 320 + Math.random() * 520 + d.captured * 220;
        d.vx += Math.cos(angle) * speed;
        d.vy += Math.sin(angle) * speed - 120;
        d.captured = Math.max(d.captured, 0.25);
      }
    }

    window.addEventListener('pointermove', function (event) {
      var dx = event.clientX - pointer.x;
      var dy = event.clientY - pointer.y;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (glow) glow.classList.add('is-visible');
      var now = performance.now();
      if (dx * dx + dy * dy > 25 && now - lastPointerComet > 180 && comets.length < 6) {
        spawnComet(now, pointer.x, pointer.y, dx, dy, true);
        lastPointerComet = now;
      }
    }, { passive: true });

    window.addEventListener('pointerdown', function (event) {
      if (event.button !== 0) return;
      if (event.target.closest('button, a, input, textarea, select, label, summary, [role="button"], [contenteditable="true"], .card, .modal, .picker, .account-shell, .projects-gallery, .photo-screen__shell, .cropbox, .timeline, .track')) return;
      grabbing = true;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (glow) glow.classList.add('is-visible');
    });

    window.addEventListener('pointerup', releaseDots);
    window.addEventListener('pointercancel', releaseDots);

    window.addEventListener('pointerleave', function () {
      if (glow) glow.classList.remove('is-visible');
      releaseDots();
    });

    window.addEventListener('resize', resize);
    resize();

    requestAnimationFrame(frame);
  }

  /* ---------- photo tool ---------- */

  function initPhoto() {
    var input = $('photoInput');
    var preview = $('photoPreview');
    var stage = $('photoStage');
    var cropBox = $('cropBox');
    var cropHandle = $('cropHandle');
    var cropRow = $('cropRow');
    var cropRatio = $('photoCropRatio');
    var cropReset = $('photoCropReset');
    var squareBtn = $('photoSquare');
    var drop = $('photoDrop');
    var replaceBtn = $('photoReplace');
    var addBtn = $('photoAdd');
    var removeBtn = $('photoRemove');
    var thumbs = $('photoThumbs');
    var before = $('photoBefore');
    var after = $('photoAfter');
    var saving = $('photoSaving');
    var format = $('photoFormat');
    var quality = $('photoQuality');
    var qualityValue = $('photoQualityValue');
    var size = $('photoSize');
    var button = $('photoCompress');
    var download = $('photoDownload');
    var downloadAll = $('photoDownloadAll');
    var downloadAllGroup = $('photoDownloadAllGroup');
    var downloadAllToggle = $('photoDownloadAllToggle');
    var downloadAllList = $('photoDownloadAllList');
    var result = $('photoResult');
    var error = $('photoError');
    var progress = $('photoProgress');
    var progressFill = $('photoProgressFill');
    var progressText = $('photoProgressText');
    if (!input) return;

    var jobs = [];
    var active = -1;
    var thumbsFresh = false;
    var listTimer = null;
    function defaultCrop() { return { x: 0, y: 0, w: 1, h: 1, ratio: 'free', square: false }; }
    function storeCrop() { var job = activeJob(); if (job) job.crop = Object.assign({}, crop); }
    var crop = defaultCrop();
    var drag = null;

    function outputName(job) {
      var base = job.name.replace(/\.[^.]+$/, '');
      var type = (job.blob && job.blob.type) || job.resultType || job.file.type || '';
      return base + ' by vidslice.' + extFor(type);
    }

    function updateSquareButton() {
      if (!squareBtn) return;
      var job = activeJob();
      var on = Boolean(job && job.crop && job.crop.square);
      squareBtn.classList.toggle('is-active', on);
      squareBtn.textContent = on ? 'Вернуть исходник' : 'Квадрат 1:1';
    }

    function toggleSquare() {
      var job = activeJob();
      if (!job || !preview.naturalWidth) return;
      if (job.crop && job.crop.square) {
        crop = defaultCrop();
      } else {
        var side = Math.min(preview.naturalWidth, preview.naturalHeight);
        crop = {
          x: (preview.naturalWidth - side) / (2 * preview.naturalWidth),
          y: (preview.naturalHeight - side) / (2 * preview.naturalHeight),
          w: side / preview.naturalWidth,
          h: side / preview.naturalHeight,
          ratio: '1:1',
          square: true
        };
      }
      if (cropRatio) cropRatio.value = crop.ratio;
      storeCrop();
      paintCrop();
      updateSquareButton();
      invalidateResults();
    }

    var picker = makePicker({
      id: 'photoPicker',
      title: 'Загрузить фото',
      hint: 'Можно выбрать несколько файлов сразу - JPEG, PNG, WebP',
      accept: 'image/jpeg,image/png,image/webp',
      multiple: true,
      onFiles: addFiles
    });

    function activeJob() { return active >= 0 ? jobs[active] : null; }

    function loadImage(file) {
      return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Не удалось открыть изображение.')); };
        img.src = url;
      });
    }

    function hasAlpha(ctx, width, height) {
      var step = Math.max(1, Math.floor(Math.sqrt((width * height) / 12000)));
      try {
        for (var y = 0; y < height; y += step) {
          var row = ctx.getImageData(0, y, width, 1).data;
          for (var x = 0; x < width; x += step) {
            if (row[x * 4 + 3] < 250) return true;
          }
        }
      } catch (e) { return false; }
      return false;
    }

    function encode(canvas, type, q) {
      return new Promise(function (resolve) { canvas.toBlob(resolve, type, q); });
    }

    function resetResult(job) {
      if (!job) return;
      if (job.resultUrl) URL.revokeObjectURL(job.resultUrl);
      job.resultUrl = '';
      job.blob = null;
      job.resultType = '';
      job.resultBytes = 0;
    }

    function setProgress(value, text) {
      if (progress) progress.classList.add('is-active');
      if (progressFill) progressFill.style.width = Math.round(Math.max(0, Math.min(1, value)) * 100) + '%';
      if (progressText) progressText.textContent = Math.round(Math.max(0, Math.min(1, value)) * 100) + '% ' + (text || '');
    }

    function clearProgress() {
      if (progress) progress.classList.remove('is-active');
      if (progressFill) progressFill.style.width = '0%';
    }

    function renderFileList() {
      if (!downloadAllList) return;
      downloadAllList.innerHTML = '';
      var ready = jobs.filter(function (job) { return job.blob; });
      if (!ready.length) return;

      var hint = document.createElement('div');
      hint.className = 'download-file-hint';
      hint.textContent = 'Отдельные файлы';
      downloadAllList.appendChild(hint);

      ready.forEach(function (job) {
        var row = document.createElement('div');
        row.className = 'download-file';

        var icon = document.createElement('span');
        icon.className = 'download-file__icon';
        var image = document.createElement('img');
        image.src = job.resultUrl || job.url;
        image.alt = '';
        icon.appendChild(image);

        var meta = document.createElement('span');
        meta.className = 'download-file__meta';
        var name = document.createElement('strong');
        name.textContent = outputName(job);
        name.title = name.textContent;
        var detail = document.createElement('span');
        detail.textContent = formatBytes(job.resultBytes || job.blob.size) + ' - ' + formatLabel(job.resultType || job.blob.type);
        meta.appendChild(name);
        meta.appendChild(detail);

        var one = document.createElement('button');
        one.className = 'download-file__btn';
        one.type = 'button';
        one.textContent = 'Скачать';
        one.setAttribute('aria-label', 'Скачать ' + name.textContent);
        one.addEventListener('click', function () { downloadJob(job); });

        row.appendChild(icon);
        row.appendChild(meta);
        row.appendChild(one);
        downloadAllList.appendChild(row);
      });
    }

    function setFileList(open) {
      if (!downloadAllToggle || !downloadAllList) return;
      var ready = jobs.length > 1 && jobs.every(function (job) { return job.blob; });
      if (open && !ready) open = false;
      if (listTimer) { clearTimeout(listTimer); listTimer = null; }
      downloadAllToggle.classList.toggle('is-open', open);
      downloadAllToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      downloadAllToggle.setAttribute('aria-label', open ? 'Скрыть отдельные файлы' : 'Показать отдельные файлы');
      if (open) {
        renderFileList();
        downloadAllList.hidden = false;
        downloadAllList.classList.add('is-open');
      } else {
        downloadAllList.classList.remove('is-open');
        listTimer = setTimeout(function () {
          if (!downloadAllList.classList.contains('is-open')) downloadAllList.hidden = true;
        }, 280);
      }
    }

    function invalidateResults() {
      jobs.forEach(resetResult);
      clearProgress();
      if (result) result.classList.remove('is-active');
      if (download) download.disabled = true;
      if (downloadAll) downloadAll.disabled = true;
      if (downloadAllToggle) downloadAllToggle.disabled = true;
      setFileList(false);
      if (after) after.textContent = '-';
      if (saving) saving.textContent = '-';
    }

    function paintCrop() {
      var job = activeJob();
      var show = Boolean(job);
      if (cropBox) cropBox.hidden = !show;
      if (cropRow) cropRow.hidden = !show;
      if (!show || !preview) return;
      requestAnimationFrame(function () {
        if (!preview.clientWidth || !preview.clientHeight) return;
        cropBox.style.left = (crop.x * preview.clientWidth) + 'px';
        cropBox.style.top = (crop.y * preview.clientHeight) + 'px';
        cropBox.style.width = (crop.w * preview.clientWidth) + 'px';
        cropBox.style.height = (crop.h * preview.clientHeight) + 'px';
      });
    }

    function applyRatio(center) {
      var r = crop.ratio;
      if (r === 'free' || !preview || !preview.naturalWidth) { paintCrop(); storeCrop(); return; }
      var parts = r.split(':');
      var target = Number(parts[0]) / Number(parts[1]);
      var iw = preview.naturalWidth;
      var ih = preview.naturalHeight;
      var w = crop.w;
      var h = w * iw / (target * ih);
      if (h > 0.92) { h = 0.92; w = h * target * ih / iw; }
      if (center) { crop.x = (1 - w) / 2; crop.y = (1 - h) / 2; }
      crop.w = w;
      crop.h = h;
      crop.x = Math.max(0, Math.min(1 - w, crop.x));
      crop.y = Math.max(0, Math.min(1 - h, crop.y));
      paintCrop();
      storeCrop();
    }

    function resetCrop() {
      crop = defaultCrop();
      if (cropRatio) cropRatio.value = 'free';
      storeCrop();
      paintCrop();
      updateSquareButton();
    }

    function showJob(index) {
      if (index < 0 || index >= jobs.length) return;
      active = index;
      var job = jobs[active];
      crop = job.crop || (job.crop = defaultCrop());
      if (cropRatio) cropRatio.value = crop.ratio || 'free';
      updateSquareButton();
      preview.onload = function () {
        if (!(crop && crop.square && crop.ratio === '1:1')) applyRatio(false);
        paintCrop();
      };
      preview.src = job.url;
      preview.hidden = false;
      reveal(preview);
      renderThumbs();
      renderStats();
      paintCrop();
    }

    function addFiles(files) {
      var added = 0;
      for (var i = 0; i < files.length; i++) {
        var file = files[i];
        if (!file || !file.type || file.type.indexOf('image/') !== 0) continue;
        jobs.push({
          file: file,
          name: file.name || 'photo.' + extFor(file.type),
          url: URL.createObjectURL(file),
          blob: null,
          resultUrl: '',
          resultType: '',
          resultBytes: 0,
          crop: defaultCrop()
        });
        added++;
      }
      if (!added) {
        showError(error, 'Нужны файлы JPEG, PNG или WebP.');
        return;
      }
      showError(error, '');
      invalidateResults();
      showJob(jobs.length - added);
      thumbsFresh = true;
      renderControls();
      reveal(stage);
      toast(added > 1 ? 'Фото загружены' : 'Фото загружено',
        added > 1 ? added + ' шт. - можно обрезать и сжать каждое' : jobs[jobs.length - added].name);
    }

    function removeActive() {
      var job = activeJob();
      if (!job) return;
      resetResult(job);
      URL.revokeObjectURL(job.url);
      jobs.splice(active, 1);
      if (!jobs.length) {
        active = -1;
        preview.hidden = true;
        preview.removeAttribute('src');
        if (cropBox) cropBox.hidden = true;
        if (cropRow) cropRow.hidden = true;
      } else {
        showJob(Math.min(active, jobs.length - 1));
      }
      invalidateResults();
      renderControls();
    }

    function renderThumbs() {
      if (!thumbs) return;
      thumbs.innerHTML = '';
      thumbs.hidden = jobs.length < 2;
      jobs.forEach(function (job, index) {
        var node = document.createElement('button');
        node.className = 'thumb' + (index === active ? ' is-active' : '');
        if (thumbsFresh) {
          node.classList.add('thumb--in');
          node.style.animationDelay = (index * 55) + 'ms';
        }
        node.type = 'button';
        node.title = job.name;
        var img = document.createElement('img');
        img.src = job.url;
        img.alt = job.name;
        node.appendChild(img);
        node.addEventListener('click', function () { showJob(index); });
        thumbs.appendChild(node);
      });
      thumbsFresh = false;
    }

    function renderStats() {
      var totalBefore = jobs.reduce(function (sum, job) { return sum + job.file.size; }, 0);
      var totalAfter = jobs.reduce(function (sum, job) { return sum + (job.resultBytes || job.file.size); }, 0);
      if (before) before.textContent = totalBefore ? formatBytes(totalBefore) : '-';
      if (after) after.textContent = totalAfter ? formatBytes(totalAfter) : '-';
      if (saving) {
        if (!totalBefore || totalAfter >= totalBefore) saving.textContent = totalBefore ? '0%' : '-';
        else saving.textContent = '-' + Math.max(0, Math.round((1 - totalAfter / totalBefore) * 100)) + '%';
      }
    }

    function renderControls() {
      var has = jobs.length > 0;
      if (drop) drop.hidden = has;
      if (replaceBtn) replaceBtn.hidden = !has;
      if (addBtn) addBtn.hidden = !has;
      if (removeBtn) removeBtn.hidden = !has;
      if (button) {
        button.disabled = !has;
        button.textContent = jobs.length > 1 ? 'Сжать все (' + jobs.length + ')' : 'Сжать фото';
      }
      var ready = jobs.length > 1 && jobs.every(function (job) { return job.blob; });
      if (downloadAllGroup) downloadAllGroup.hidden = jobs.length < 2;
      if (downloadAll) downloadAll.disabled = !ready;
      if (downloadAllToggle) downloadAllToggle.disabled = !ready;
      if (!ready) setFileList(false);
      renderThumbs();
      renderStats();
    }

    async function compressOne(job) {
      resetResult(job);
      var img = await loadImage(job.file);
      var c = job.crop || defaultCrop();
      var sw = Math.max(1, Math.round(c.w * img.naturalWidth));
      var sh = Math.max(1, Math.round(c.h * img.naturalHeight));
      var sx = Math.max(0, Math.min(img.naturalWidth - 1, Math.round(c.x * img.naturalWidth)));
      var sy = Math.max(0, Math.min(img.naturalHeight - 1, Math.round(c.y * img.naturalHeight)));
      var max = Number(size ? size.value : 0) || 0;
      var scale = max > 0 ? Math.min(1, max / Math.max(sw, sh)) : 1;
      var w = Math.max(1, Math.round(sw * scale));
      var h = Math.max(1, Math.round(sh * scale));
      var canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);

      var requested = format ? format.value : 'image/jpeg';
      var q = Number(quality ? quality.value : 80) / 100;
      var blob = await encode(canvas, requested, q);
      if (!blob) throw new Error('Браузер не смог сохранить результат.');
      if (!blob.type) blob = new Blob([blob], { type: requested });

      job.blob = blob;
      job.resultType = requested;
      job.resultBytes = blob.size;
      job.resultUrl = URL.createObjectURL(blob);
    }

    async function compress() {
      if (!jobs.length) return;
      beginWork();
      showError(error, '');
      if (button) button.disabled = true;
      setFileList(false);
      invalidateResults();
      var done = 0;
      try {
        setProgress(0.03, 'Готовим...');
        scrollToNode(progress, 500);
        for (var i = 0; i < jobs.length; i++) {
          var label = 'Сжимаем ' + (i + 1) + ' / ' + jobs.length;
          if (button) button.textContent = label;
          setProgress(0.05 + (i / jobs.length) * 0.85, label);
          await new Promise(function (resolve) { setTimeout(resolve, 140); });
          await compressOne(jobs[i]);
          done++;
          setProgress(0.05 + (done / jobs.length) * 0.85, label);
          await new Promise(function (resolve) { setTimeout(resolve, 160); });
        }
        setProgress(1, 'Готово');
        renderStats();
        if (result) {
          result.classList.add('is-active');
          var text = result.querySelector('[data-result-text]');
          if (text) {
            var label = formatLabel(format ? format.value : 'image/jpeg');
            text.textContent = done > 1
              ? 'Готово ' + done + ' фото. Кадр учтён, формат ' + label + ' сохранён.'
              : 'Кадр учтён, формат ' + label + ' сохранён.';
          }
        }
        if (download) download.disabled = !activeJob() || !activeJob().blob;
        if (downloadAll) downloadAll.disabled = jobs.some(function (job) { return !job.blob; });
        scrollToNode(download, 350);
        if (done > 1) {
          toast('Готово', 'Сжато ' + done + ' фото - нажмите «Скачать все в архиве»');
        } else {
          toast('Готово', 'Фото сжато - скачиваем');
          setTimeout(function () { downloadJob(activeJob()); }, 150);
        }
      } catch (e) {
        clearProgress();
        showError(error, (e && e.message) || 'Не удалось сжать фото.');
      } finally {
        endWork();
        renderControls();
        if (download) download.disabled = !activeJob() || !activeJob().blob;
        if (downloadAll) downloadAll.disabled = jobs.some(function (job) { return !job.blob; });
      }
    }

    function downloadJob(job) {
      if (!job || !job.blob) return;
      downloadBlob(job.blob, outputName(job));
    }

    async function downloadAllJobs() {
      var ready = jobs.filter(function (job) { return job.blob; });
      if (!ready.length) return;
      if (ready.length === 1) { downloadJob(ready[0]); return; }
      try {
        var entries = ready.map(function (job) { return { name: outputName(job), blob: job.blob }; });
        var archive = await makeZip(entries);
        downloadBlob(archive, 'vidslice-photos by vidslice.zip');
        toast('Архив готов', ready.length + ' фото в одном ZIP-файле');
      } catch (e) {
        toast('Не удалось собрать архив', 'Попробуйте скачать фото по одному', 'error');
      }
    }

    input.addEventListener('change', function () {
      if (input.files && input.files.length) addFiles(Array.prototype.slice.call(input.files));
      input.value = '';
    });
    if (button) button.addEventListener('click', compress);
    if (quality) quality.addEventListener('input', function () {
      if (qualityValue) qualityValue.textContent = quality.value + '%';
      invalidateResults();
    });
    if (format) format.addEventListener('change', invalidateResults);
    if (size) size.addEventListener('change', invalidateResults);
    if (download) download.addEventListener('click', function () { downloadJob(activeJob()); });
    if (downloadAll) downloadAll.addEventListener('click', downloadAllJobs);
    if (downloadAllToggle) downloadAllToggle.addEventListener('click', function () {
      setFileList(!downloadAllToggle.classList.contains('is-open'));
    });
    if (replaceBtn) replaceBtn.addEventListener('click', picker.open);
    if (addBtn) addBtn.addEventListener('click', picker.open);
    if (removeBtn) removeBtn.addEventListener('click', removeActive);

    if (drop) {
      drop.addEventListener('click', function () { picker.open(); });
      ['dragenter', 'dragover'].forEach(function (type) {
        drop.addEventListener(type, function (e) { e.preventDefault(); drop.classList.add('is-over'); });
      });
      ['dragleave', 'drop'].forEach(function (type) {
        drop.addEventListener(type, function (e) { e.preventDefault(); drop.classList.remove('is-over'); });
      });
      drop.addEventListener('drop', function (e) {
        if (e.dataTransfer && e.dataTransfer.files) addFiles(Array.prototype.slice.call(e.dataTransfer.files));
      });
    }

    if (cropRatio) cropRatio.addEventListener('change', function () {
      crop.ratio = cropRatio.value;
      crop.square = crop.ratio === '1:1';
      applyRatio(true);
      storeCrop();
      updateSquareButton();
      invalidateResults();
    });
    if (cropReset) cropReset.addEventListener('click', function () { resetCrop(); invalidateResults(); });
    if (squareBtn) squareBtn.addEventListener('click', toggleSquare);

    if (cropBox && cropHandle) {
      cropBox.addEventListener('pointerdown', function (e) {
        if (e.target === cropHandle) return;
        startDrag(e, false);
      });
      cropHandle.addEventListener('pointerdown', function (e) {
        e.stopPropagation();
        startDrag(e, true);
      });
    }

    function startDrag(e, resize) {
      if (!activeJob() || !preview) return;
      e.preventDefault();
      drag = {
        resize: resize,
        x: e.clientX,
        y: e.clientY,
        crop: { x: crop.x, y: crop.y, w: crop.w, h: crop.h }
      };
      window.addEventListener('pointermove', onDrag);
      window.addEventListener('pointerup', endDrag, { once: true });
    }

    function onDrag(e) {
      if (!drag || !preview || !preview.clientWidth) return;
      var dx = (e.clientX - drag.x) / preview.clientWidth;
      var dy = (e.clientY - drag.y) / preview.clientHeight;
      if (drag.resize) {
        var w = Math.max(0.1, Math.min(1 - drag.crop.x, drag.crop.w + dx));
        var h;
        if (crop.ratio !== 'free') {
          var parts = crop.ratio.split(':');
          var target = Number(parts[0]) / Number(parts[1]);
          h = w * preview.naturalWidth / (target * preview.naturalHeight);
          if (drag.crop.y + h > 1) {
            h = 1 - drag.crop.y;
            w = h * target * preview.naturalHeight / preview.naturalWidth;
          }
        } else {
          h = Math.max(0.1, Math.min(1 - drag.crop.y, drag.crop.h + dy));
        }
        crop.w = w;
        crop.h = h;
      } else {
        crop.x = Math.max(0, Math.min(1 - drag.crop.w, drag.crop.x + dx));
        crop.y = Math.max(0, Math.min(1 - drag.crop.h, drag.crop.y + dy));
      }
      paintCrop();
      storeCrop();
    }

    function endDrag() {
      if (!drag) return;
      drag = null;
      window.removeEventListener('pointermove', onDrag);
      invalidateResults();
    }

    renderControls();
  }

  /* ---------- video engine and editor ---------- */

  function initEditor() {
    var input = $('videoInput');
    var drop = $('videoDrop');
    var video = $('videoPreview');
    var name = $('videoName');
    var durationNode = $('videoDuration');
    var startSlider = $('trimStart');
    var endSlider = $('trimEnd');
    var startValue = $('startValue');
    var endValue = $('endValue');
    var quality = $('videoQuality');
    var compressToggle = $('videoCompress');
    var modeSelect = $('exportMode');
    var exportBtn = $('exportBtn');
    var progress = $('videoProgress');
    var progressFill = $('videoProgressFill');
    var progressText = $('videoProgressText');
    var result = $('videoResult');
    var resultText = $('videoResultText');
    var download = $('videoDownload');
    var error = $('videoError');
    var trimBand = $('trimBand');
    var trimRangeText = $('trimRangeText');
    var trimStartLabel = $('trimStartLabel');
    var trimEndLabel = $('trimEndLabel');
    var fragmentHead = $('videoFragmentHead');
    var fragmentRange = $('videoFragmentRange');
    var replaceBtn = $('videoReplace');
    if (!input) return;

    var picker = makePicker({
      id: 'videoPicker',
      title: 'Загрузить видео',
      hint: 'MP4, MOV, WebM, MKV или другой формат, который открывает браузер',
      accept: 'video/*',
      multiple: false,
      onFiles: function (files) { setFile(files[0]); }
    });

    var CORE_URL = new URL('/vendor/ffmpeg/ffmpeg-core.js', location.origin).href;
    var WASM_GZ_URL = new URL('/vendor/ffmpeg/ffmpeg-core.wasm.gz', location.origin).href;
    var CDN_WASM_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm';
    var engine = null;
    var enginePromise = null;
    var file = null;
    var sourceUrl = '';
    var outputUrl = '';
    var outputBlob = null;
    var duration = 0;

    function setError(message) { showError(error, message); }

    function applyMode() {
      var mode = modeSelect ? modeSelect.value : 'optimal';
      var manual = mode === 'manual';
      if (quality) {
        quality.disabled = !manual;
        if (mode === 'fast') quality.value = '480';
        else if (!manual) quality.value = 'source';
      }
      if (compressToggle) {
        compressToggle.disabled = !manual;
        compressToggle.checked = mode === 'fast';
      }
    }

    function setProgress(value, text) {
      var pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
      if (progress) progress.classList.add('is-active');
      if (progressFill) progressFill.style.width = pct + '%';
      if (progressText) progressText.textContent = pct + '% ' + (text || '');
    }

    function clearProgress() {
      if (progress) progress.classList.remove('is-active');
      if (progressFill) progressFill.style.width = '0%';
    }

    function updateTrim() {
      var a = Number(startSlider.value);
      var b = Number(endSlider.value);
      if (a > b - 0.1) a = Math.max(0, b - 0.1);
      startSlider.value = a;
      endSlider.max = duration;
      endSlider.value = b;
      if (startValue) startValue.textContent = formatTime(a);
      if (endValue) endValue.textContent = formatTime(b);
      if (trimRangeText) trimRangeText.textContent = formatTime(a) + ' - ' + formatTime(b);
      if (fragmentRange) fragmentRange.textContent = formatTime(a) + ' - ' + formatTime(b);
      if (video && isFinite(video.duration) && (video.currentTime < a - 0.05 || video.currentTime > b + 0.05)) {
        try { video.currentTime = a; } catch (e) { /* ignore */ }
      }

      if (trimBand && duration > 0) {
        var startPct = Math.max(0, Math.min(100, (a / duration) * 100));
        var endPct = Math.max(0, Math.min(100, (b / duration) * 100));
        trimBand.style.left = startPct + '%';
        trimBand.style.width = Math.max(0, endPct - startPct) + '%';
        if (trimStartLabel) {
          trimStartLabel.style.left = startPct + '%';
          trimStartLabel.textContent = formatTime(a);
        }
        if (trimEndLabel) {
          trimEndLabel.style.left = endPct + '%';
          trimEndLabel.style.transform = 'translateX(-100%)';
          trimEndLabel.textContent = formatTime(b);
        }
      }
    }

    function setFile(next) {
      if (!next || !next.type || next.type.indexOf('video/') !== 0) {
        setError('Нужен видеофайл, которое браузер может открыть.');
        return;
      }
      setError('');
      if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      if (outputUrl) URL.revokeObjectURL(outputUrl);
      sourceUrl = URL.createObjectURL(next);
      outputUrl = '';
      outputBlob = null;
      file = next;
      if (video) {
        video.hidden = false;
        video.src = sourceUrl;
        reveal(video);
      }
      if (name) name.textContent = next.name;
      if (drop) drop.hidden = true;
      if (replaceBtn) replaceBtn.hidden = false;
      if (fragmentHead) fragmentHead.hidden = false;
      if (result) result.classList.remove('is-active');
      if (download) download.disabled = true;
      if (exportBtn) exportBtn.disabled = false;
      clearProgress();
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(function () { ensureEngine(function () { }).catch(function () { }); });
      } else {
        setTimeout(function () { ensureEngine(function () { }).catch(function () { }); }, 300);
      }
    }

    async function prepareWasm(onProgress) {
      var candidates = [
        { url: WASM_GZ_URL, gz: true },
        { url: CDN_WASM_URL, gz: false }
      ];
      var last = null;
      for (var i = 0; i < candidates.length; i++) {
        try {
          var response = await fetch(candidates[i].url);
          if (!response.ok) throw new Error('HTTP ' + response.status);
          var bytes = await response.arrayBuffer();
          if (candidates[i].gz && bytes.byteLength > 2 && new Uint8Array(bytes)[0] === 0x1f) {
            bytes = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
          }
          onProgress(1);
          return URL.createObjectURL(new Blob([bytes], { type: 'application/wasm' }));
        } catch (e) { last = e; }
      }
      throw last || new Error('Не удалось загрузить движок.');
    }

    async function ensureEngine(onProgress) {
      if (engine) return engine;
      if (enginePromise) return enginePromise;
      enginePromise = (async function () {
        var FFmpeg = window.FFmpegWASM && window.FFmpegWASM.FFmpeg;
        if (!FFmpeg) throw new Error('Библиотека обработки не загрузилась.');
        var wasm = await prepareWasm(onProgress);
        var instance = new FFmpeg();
        await instance.load({ coreURL: CORE_URL, wasmURL: wasm });
        engine = instance;
        return instance;
      })().catch(function (e) { enginePromise = null; throw e; });
      return enginePromise;
    }

    async function sniffCodecs(source) {
      var bytes = [];
      var head = await source.slice(0, Math.min(source.size, 1024 * 1024)).arrayBuffer();
      bytes.push(new Uint8Array(head));
      if (source.size > 1024 * 1024) {
        var tail = await source.slice(source.size - 1024 * 1024).arrayBuffer();
        bytes.push(new Uint8Array(tail));
      }
      var text = '';
      for (var i = 0; i < bytes.length; i++) {
        for (var j = 0; j < bytes[i].length; j += 8192) {
          text += String.fromCharCode.apply(null, bytes[i].subarray(j, j + 8192));
        }
      }
      return {
        h264: /avc1|avcC/.test(text),
        aac: /mp4a/.test(text),
        audio: /mp4a|sowt|enca/.test(text)
      };
    }

    function scaleFilter(preset) {
      var w = video ? video.videoWidth : 0;
      var h = video ? video.videoHeight : 0;
      var even = "scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1";
      if (preset === 'source' || !preset) {
        if (w > 0 && h > 0 && w % 2 === 0 && h % 2 === 0) return '';
        return even;
      }
      var cap = preset === '1080' ? [1920, 1080] : preset === '720' ? [1280, 720] : [854, 480];
      return "scale=w='min(" + cap[0] + ",iw)':h='min(" + cap[1] + ",ih)':force_original_aspect_ratio=decrease:flags=fast_bilinear," + even;
    }

    function buildArgs(inputName, outputName, start, length, settings) {
      var filter = scaleFilter(settings.preset);
      var args = [
        '-ss', start.toFixed(3),
        '-i', inputName,
        '-t', length.toFixed(3),
        '-map', '0:v:0',
        '-map', '0:a?'
      ];
      if (filter) args.push('-vf', filter);
      args.push(
        '-c:v', 'libx264',
        '-preset', settings.speed,
        '-crf', settings.crf,
        '-pix_fmt', 'yuv420p',
        '-g', '60',
        '-max_muxing_queue_size', '1024',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-y', outputName
      );
      return args;
    }

    function buildCopyArgs(inputName, outputName, start, length, codecs) {
      var args = [
        '-ss', start.toFixed(3),
        '-i', inputName,
        '-t', length.toFixed(3),
        '-map', '0:v:0'
      ];
      if (codecs.audio) {
        args.push('-map', '0:a?');
        if (codecs.aac) args.push('-c:a', 'copy');
        else args.push('-c:a', 'aac', '-b:a', '128k');
      } else {
        args.push('-an');
      }
      args.push(
        '-c:v', 'copy',
        '-avoid_negative_ts', 'make_zero',
        '-y', outputName
      );
      return args;
    }

    async function exportVideo() {
      if (!file) return;
      beginWork();
      setError('');
      if (exportBtn) { exportBtn.disabled = true; exportBtn.textContent = 'Экспортируем...'; }
      var start = Number(startSlider.value);
      var end = Number(endSlider.value);
      var length = Math.max(0.1, end - start);
      var inputName = 'input.' + (file.name.split('.').pop() || 'mp4').toLowerCase();
      var outputName = 'output.mp4';
      var ffmpeg = null;
      var mount = '';
      var mounted = false;
      var cleanup = [outputName];

      try {
        setProgress(0.02, 'Загружаем движок...');
        scrollToNode(progress, 500);
        ffmpeg = await ensureEngine(function (p) { setProgress(0.02 + p * 0.22, 'Загружаем движок...'); });

        setProgress(0.28, 'Подключаем видео...');
        mount = '/vidslice_' + Date.now().toString(36);
        try {
          await ffmpeg.createDir(mount);
          mounted = await ffmpeg.mount('WORKERFS', { blobs: [{ name: inputName, data: file }] }, mount);
        } catch (e) { mounted = false; }

        var inputPath = inputName;
        if (mounted) {
          inputPath = mount + '/' + inputName;
        } else {
          if (file.size > 1.2 * 1024 * 1024 * 1024) throw new Error('Большой файл не удалось подключить. Попробуйте файл поменьше.');
          setProgress(0.32, 'Читаем видео...');
          await ffmpeg.writeFile(inputName, new Uint8Array(await file.arrayBuffer()));
          cleanup.push(inputName);
        }

        setProgress(0.40, 'Проверяем формат...');
        var codecs = await sniffCodecs(file);
        var mode = modeSelect ? modeSelect.value : 'optimal';
        var settings = { preset: 'source', crf: '24', speed: 'ultrafast' };
        if (mode === 'fast') settings = { preset: '480', crf: '32', speed: 'ultrafast' };
        else if (mode === 'quality') settings = { preset: 'source', crf: '18', speed: 'veryfast' };
        else if (mode === 'manual') {
          settings = {
            preset: quality ? quality.value : 'source',
            crf: compressToggle && compressToggle.checked ? '30' : '24',
            speed: 'ultrafast'
          };
        }
        var copyMode = mode !== 'quality' && codecs.h264 &&
          (mode !== 'manual' || (settings.preset === 'source' && settings.crf === '24'));
        var modeLabel = mode === 'fast' ? 'Быстро' : mode === 'quality' ? 'Качество' : mode === 'manual' ? 'Вручную' : 'Оптимальный';
        var stage = copyMode ? 'Копируем видео...' : 'Кодируем видео...';
        setProgress(0.44, stage);

        var onProgress = function (event) {
          var p = Number(event.progress) || 0;
          setProgress(0.45 + p * 0.5, stage + ' ' + Math.round(p * 100) + '%');
        };
        var onLog = function (event) {
          var match = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(event.message || '');
          if (match && length > 0) {
            var seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
            setProgress(0.45 + Math.min(1, seconds / length) * 0.5, stage);
          }
        };
        ffmpeg.on('progress', onProgress);
        ffmpeg.on('log', onLog);

        try {
          var runArgs = copyMode
            ? buildCopyArgs(inputPath, outputName, start, length, codecs)
            : buildArgs(inputPath, outputName, start, length, settings);
          await ffmpeg.exec(runArgs);
        } finally {
          ffmpeg.off('progress', onProgress);
          ffmpeg.off('log', onLog);
        }

        setProgress(0.97, 'Готовим файл...');
        var data = await ffmpeg.readFile(outputName);
        outputBlob = new Blob([data], { type: 'video/mp4' });
        if (outputUrl) URL.revokeObjectURL(outputUrl);
        outputUrl = URL.createObjectURL(outputBlob);
        setProgress(1, 'Готово.');

        if (result) result.classList.add('is-active');
        if (resultText) {
          resultText.textContent = formatBytes(outputBlob.size) + ' - MP4, длительность ' + formatTime(length) +
            ' - ' + modeLabel + (copyMode ? ', без перекодирования' : outputBlob.size < file.size ? ', вес уменьшен' : ', вес может отличаться от исходника');
        }
        if (download) download.disabled = false;
        scrollToNode(download, 350);
        toast('Видео готово', formatBytes(outputBlob.size) + ' - MP4, ' + formatTime(length) + ' - ' + modeLabel + (copyMode ? ', без перекодирования' : ''));
        for (var i = 0; i < cleanup.length; i++) {
          try { await ffmpeg.deleteFile(cleanup[i]); } catch (e) { /* ignore */ }
        }
        if (mounted) {
          try { await ffmpeg.unmount(mount); } catch (e) { /* ignore */ }
          try { await ffmpeg.deleteDir(mount); } catch (e) { /* ignore */ }
        }
      } catch (e) {
        setError((e && e.message) || 'Не удалось собрать видео. Попробуйте другой файл.');
        clearProgress();
      } finally {
        endWork();
        if (exportBtn) { exportBtn.disabled = !file; exportBtn.textContent = 'Собрать MP4'; }
      }
    }

    input.addEventListener('change', function () {
      if (input.files && input.files[0]) setFile(input.files[0]);
      input.value = '';
    });
    if (video) video.addEventListener('loadedmetadata', function () {
      duration = video.duration || 0;
      if (durationNode) durationNode.textContent = formatTime(duration);
      [startSlider, endSlider].forEach(function (slider) {
        if (!slider) return;
        slider.max = duration;
        slider.step = 0.01;
      });
      if (startSlider) startSlider.value = 0;
      if (endSlider) endSlider.value = duration;
      updateTrim();
      toast('Видео загружено', (file ? file.name + ' - ' : '') + formatTime(duration));
    });
    if (video) video.addEventListener('timeupdate', function () {
      if (!file || !isFinite(video.duration)) return;
      var a = Number(startSlider.value);
      var b = Number(endSlider.value);
      if (video.currentTime > b - 0.02) {
        video.pause();
        try { video.currentTime = a; } catch (e) { /* ignore */ }
      } else if (video.currentTime < a - 0.12) {
        try { video.currentTime = a; } catch (e) { /* ignore */ }
      }
    });
    [startSlider, endSlider].forEach(function (slider) { if (slider) slider.addEventListener('input', updateTrim); });
    if (modeSelect) modeSelect.addEventListener('change', applyMode);
    applyMode();
    if (exportBtn) exportBtn.addEventListener('click', exportVideo);
    if (download) download.addEventListener('click', function () {
      if (!outputBlob) return;
      var base = (file ? file.name : 'video').replace(/\.[^.]+$/, '');
      downloadBlob(outputBlob, base + '-vidslice.mp4');
    });

    if (replaceBtn) replaceBtn.addEventListener('click', picker.open);

    if (drop) {
      drop.addEventListener('click', picker.open);
      ['dragenter', 'dragover'].forEach(function (type) {
        drop.addEventListener(type, function (e) { e.preventDefault(); drop.classList.add('is-over'); });
      });
      ['dragleave', 'drop'].forEach(function (type) {
        drop.addEventListener(type, function (e) { e.preventDefault(); drop.classList.remove('is-over'); });
      });
      drop.addEventListener('drop', function (e) {
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
      });
    }

    var fullLink = document.querySelector('[data-full-editor]');
    if (fullLink) fullLink.addEventListener('click', function (e) {
      if (!file) return;
      e.preventDefault();
      var href = fullLink.getAttribute('href');
      saveHandoff({
        blob: file,
        name: file.name || 'video.mp4',
        type: file.type || 'video/mp4',
        start: Number(startSlider.value),
        end: Number(endSlider.value)
      }).then(function () { location.href = href; }, function () { location.href = href; });
    });

    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(function () { ensureEngine(function () { }).catch(function () { }); });
    } else {
      setTimeout(function () { ensureEngine(function () { }).catch(function () { }); }, 1200);
    }
  }

  /* ---------- theme and account ---------- */

  function initTheme() {
    var button = $('themeToggle');
    if (!button) return;
    button.addEventListener('click', function () {
      var next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('vidslice-theme', next); } catch (error) { /* ignore */ }
      updateDotColor();
    });
  }

  function initAccount() {
    var button = $('accountBtn');
    if (!button) return;

    var modal = document.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('role', 'presentation');
    modal.innerHTML = [
      '<div class="modal__box" role="dialog" aria-modal="true" aria-labelledby="accountTitle">',
      '  <div class="modal__head">',
      '    <div class="modal__title" id="accountTitle">Аккаунт</div>',
      '    <button class="modal__close" type="button" data-account-close aria-label="Закрыть">&times;</button>',
      '  </div>',
      '  <div data-account-step="email">',
      '    <p class="panel__hint">Введите email. В статической версии код показывается прямо здесь, письмо не отправляется.</p>',
      '    <div class="field"><label for="accountEmail">Email</label><input id="accountEmail" type="email" autocomplete="email" placeholder="you@example.com"></div>',
      '    <div class="actions"><button class="btn btn--primary" type="button" data-account-send>Получить код</button></div>',
      '  </div>',
      '  <div data-account-step="code" hidden>',
      '    <p class="panel__hint">Код для <b data-account-email-label></b></p>',
      '    <div class="demo-code" data-account-code></div>',
      '    <div class="field"><label for="accountCode">Код из 4 цифр</label><input id="accountCode" type="text" inputmode="numeric" maxlength="4" placeholder="0000"></div>',
      '    <div class="actions"><button class="btn btn--primary" type="button" data-account-verify>Войти</button><button class="btn" type="button" data-account-back>Назад</button></div>',
      '  </div>',
      '  <div data-account-step="done" hidden>',
      '    <p class="panel__hint">Вы вошли как <b data-account-done-email></b>.</p>',
      '    <div class="actions"><button class="btn" type="button" data-account-logout>Выйти</button></div>',
      '  </div>',
      '  <div class="error" data-account-error></div>',
      '</div>'
    ].join('');
    document.body.appendChild(modal);

    var avatar = button.querySelector('[data-account-avatar]');
    var label = button.querySelector('[data-account-name]');
    var errorNode = modal.querySelector('[data-account-error]');
    var emailInput = modal.querySelector('#accountEmail');
    var codeInput = modal.querySelector('#accountCode');
    var generated = '';
    var pendingEmail = '';

    function storedEmail() {
      try { return localStorage.getItem('vidslice-account') || ''; } catch (error) { return ''; }
    }

    function paintButton() {
      var email = storedEmail();
      if (avatar) avatar.textContent = email ? email.charAt(0).toUpperCase() : 'Г';
      if (label) label.textContent = email || 'Войти';
    }

    function showStep(name) {
      modal.querySelectorAll('[data-account-step]').forEach(function (node) {
        node.hidden = node.getAttribute('data-account-step') !== name;
      });
      showError(errorNode, '');
    }

    function open() {
      paintButton();
      showStep(storedEmail() ? 'done' : 'email');
      modal.classList.remove('is-closing');
      modal.classList.add('is-open');
      var focusTarget = storedEmail() ? modal.querySelector('[data-account-logout]') : emailInput;
      if (focusTarget) focusTarget.focus();
    }

    function close() { animatedClose(modal); }

    button.addEventListener('click', open);
    modal.querySelector('[data-account-close]').addEventListener('click', close);
    modal.addEventListener('click', function (event) { if (event.target === modal) close(); });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && modal.classList.contains('is-open')) close();
    });

    modal.querySelector('[data-account-send]').addEventListener('click', function () {
      var email = (emailInput.value || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError(errorNode, 'Введите корректный email.');
        return;
      }
      pendingEmail = email;
      generated = String(Math.floor(1000 + Math.random() * 9000));
      modal.querySelector('[data-account-email-label]').textContent = email;
      modal.querySelector('[data-account-code]').textContent = generated;
      codeInput.value = '';
      showStep('code');
      codeInput.focus();
    });

    modal.querySelector('[data-account-back]').addEventListener('click', function () { showStep('email'); });

    modal.querySelector('[data-account-verify]').addEventListener('click', function () {
      if ((codeInput.value || '').trim() !== generated) {
        showError(errorNode, 'Неверный код. Попробуйте ещё раз.');
        return;
      }
      try { localStorage.setItem('vidslice-account', pendingEmail); } catch (error) { /* ignore */ }
      modal.querySelector('[data-account-done-email]').textContent = pendingEmail;
      paintButton();
      showStep('done');
    });

    modal.querySelector('[data-account-logout]').addEventListener('click', function () {
      try { localStorage.removeItem('vidslice-account'); } catch (error) { /* ignore */ }
      paintButton();
      showStep('email');
    });

    paintButton();
  }

  function init() {
    updateDotColor();
    initCursorField();
    initCardTilt();
    initTheme();
    initAccount();
    var page = document.body.dataset.page;
    if (page === 'photo') initPhoto();
    if (page === 'editor') initEditor();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
