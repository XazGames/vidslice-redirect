/* VidSlice - pure client-side tools. One file, one style, no hidden routes. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var dotColor = '255, 255, 255';

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
    var ctx = canvas ? canvas.getContext('2d') : null;
    var width = 0;
    var height = 0;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

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
      for (var i = 0; i < count; i++) {
        dots.push({
          x: Math.random() * width,
          y: Math.random() * height,
          ox: 0,
          oy: 0,
          r: 0.6 + Math.random() * 1.4,
          phase: Math.random() * Math.PI * 2
        });
      }
      draw(0);
    }

    function draw(time) {
      if (!ctx) return;
      ctx.clearRect(0, 0, width, height);
      for (var i = 0; i < dots.length; i++) {
        var d = dots[i];
        var dx = pointer.x - d.x;
        var dy = pointer.y - d.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var force = Math.max(0, 1 - dist / 260);
        var pull = force * force * 26;
        var drift = Math.sin(time / 900 + d.phase) * 3;
        var x = d.x + (dx / dist) * pull;
        var y = d.y + (dy / dist) * pull + drift;
        ctx.beginPath();
        ctx.arc(x, y, d.r + force * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(' + dotColor + ',' + (0.18 + force * 0.55) + ')';
        ctx.fill();
      }
    }

    function frame(time) {
      current.x += (pointer.x - current.x) * 0.12;
      current.y += (pointer.y - current.y) * 0.12;
      if (glow) glow.style.transform = 'translate3d(' + current.x + 'px,' + current.y + 'px,0)';
      draw(time);
      requestAnimationFrame(frame);
    }

    window.addEventListener('pointermove', function (event) {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (glow) glow.classList.add('is-visible');
    }, { passive: true });

    window.addEventListener('pointerleave', function () {
      if (glow) glow.classList.remove('is-visible');
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
    var result = $('photoResult');
    var error = $('photoError');
    if (!input) return;

    var jobs = [];
    var active = -1;
    var thumbsFresh = false;
    function defaultCrop() { return { x: 0.1, y: 0.1, w: 0.8, h: 0.8, ratio: 'free' }; }
    function storeCrop() { var job = activeJob(); if (job) job.crop = Object.assign({}, crop); }
    var crop = defaultCrop();
    var drag = null;

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

    function invalidateResults() {
      jobs.forEach(resetResult);
      if (result) result.classList.remove('is-active');
      if (download) download.disabled = true;
      if (downloadAll) downloadAll.disabled = true;
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
      crop.ratio = cropRatio ? cropRatio.value : 'free';
      applyRatio(true);
    }

    function showJob(index) {
      if (index < 0 || index >= jobs.length) return;
      active = index;
      var job = jobs[active];
      crop = job.crop || (job.crop = defaultCrop());
      if (cropRatio) cropRatio.value = crop.ratio || 'free';
      preview.onload = function () { applyRatio(false); paintCrop(); };
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
      if (downloadAll) downloadAll.hidden = jobs.length < 2;
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

      var alpha = hasAlpha(ctx, w, h);
      var requested = format ? format.value : 'image/jpeg';
      var q = Number(quality ? quality.value : 80) / 100;
      var types = [requested];
      if (requested !== 'image/webp') types.push('image/webp');
      if (alpha && requested !== 'image/png') types.push('image/png');
      if (!alpha && requested !== 'image/jpeg') types.push('image/jpeg');

      var best = null;
      for (var i = 0; i < types.length; i++) {
        var blob = await encode(canvas, types[i], q);
        if (blob && (!best || blob.size < best.blob.size)) best = { blob: blob, type: types[i] };
      }
      if (!best) throw new Error('Браузер не смог сохранить результат.');

      var smaller = best.blob.size < job.file.size;
      job.blob = smaller ? best.blob : job.file;
      job.resultType = smaller ? best.type : (job.file.type || 'image/jpeg');
      job.resultBytes = job.blob.size;
      job.resultUrl = URL.createObjectURL(job.blob);
    }

    async function compress() {
      if (!jobs.length) return;
      showError(error, '');
      if (button) button.disabled = true;
      invalidateResults();
      var done = 0;
      try {
        for (var i = 0; i < jobs.length; i++) {
          if (button) button.textContent = 'Сжимаем... ' + (i + 1) + ' / ' + jobs.length;
          await compressOne(jobs[i]);
          done++;
        }
        renderStats();
        if (result) {
          result.classList.add('is-active');
          var text = result.querySelector('[data-result-text]');
          if (text) {
            text.textContent = done > 1
              ? 'Готово ' + done + ' фото. Кадр учтён, формат результата подобран автоматически.'
              : 'Кадр учтён, формат результата подобран автоматически.';
          }
        }
        if (download) download.disabled = !activeJob() || !activeJob().blob;
        if (downloadAll) downloadAll.disabled = jobs.some(function (job) { return !job.blob; });
        toast('Готово', done > 1 ? 'Сжато ' + done + ' фото' : 'Фото сжато - можно скачивать');
      } catch (e) {
        showError(error, (e && e.message) || 'Не удалось сжать фото.');
      } finally {
        renderControls();
        if (download) download.disabled = !activeJob() || !activeJob().blob;
        if (downloadAll) downloadAll.disabled = jobs.some(function (job) { return !job.blob; });
      }
    }

    function downloadJob(job) {
      if (!job || !job.blob) return;
      var base = job.name.replace(/\.[^.]+$/, '');
      downloadBlob(job.blob, base + '-vidslice.' + extFor(job.resultType));
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
    if (downloadAll) downloadAll.addEventListener('click', function () {
      jobs.forEach(function (job, index) {
        if (!job.blob) return;
        setTimeout(function () { downloadJob(job); }, index * 260);
      });
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
      applyRatio(true);
      invalidateResults();
    });
    if (cropReset) cropReset.addEventListener('click', function () { resetCrop(); invalidateResults(); });

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

    var CORE_URL = new URL('vendor/ffmpeg/ffmpeg-core.js', document.baseURI).href;
    var WASM_GZ_URL = new URL('vendor/ffmpeg/ffmpeg-core.wasm.gz', document.baseURI).href;
    var CDN_WASM_URL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm';
    var engine = null;
    var enginePromise = null;
    var file = null;
    var sourceUrl = '';
    var outputUrl = '';
    var outputBlob = null;
    var duration = 0;

    function setError(message) { showError(error, message); }

    function setProgress(value, text) {
      if (progress) progress.classList.add('is-active');
      if (progressFill) progressFill.style.width = Math.round(Math.max(0, Math.min(1, value)) * 100) + '%';
      if (progressText) progressText.textContent = text || '';
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

    async function probeAudio(ffmpeg, inputName) {
      var logs = [];
      var handler = function (event) { if (event.message) logs.push(event.message); };
      ffmpeg.on('log', handler);
      try { await ffmpeg.exec(['-i', inputName]); } catch (e) { /* probe always exits non-zero */ }
      ffmpeg.off('log', handler);
      return /Stream #\d+:\d+.*Audio:/.test(logs.join('\n'));
    }

    function scaleFilter(preset) {
      var even = "scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1";
      if (preset === '1080') return "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease," + even;
      if (preset === '720') return "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease," + even;
      if (preset === '480') return "scale=w='min(854,iw)':h='min(480,ih)':force_original_aspect_ratio=decrease," + even;
      return even;
    }

    function buildArgs(inputName, outputName, hasAudio, start, length) {
      var args = [
        '-i', inputName,
        '-ss', start.toFixed(3),
        '-t', length.toFixed(3),
        '-vf', scaleFilter(quality ? quality.value : 'source'),
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', compressToggle && compressToggle.checked ? '30' : '24',
        '-pix_fmt', 'yuv420p',
        '-g', '60',
        '-movflags', '+faststart',
        '-max_muxing_queue_size', '1024'
      ];
      if (hasAudio) args.push('-c:a', 'aac', '-b:a', '128k');
      else args.push('-an');
      args.push('-y', outputName);
      return args;
    }

    async function exportVideo() {
      if (!file) return;
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
        ffmpeg = await ensureEngine(function (p) { setProgress(0.02 + p * 0.22, 'Загружаем движок... ' + Math.round(p * 100) + '%'); });

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

        setProgress(0.38, 'Проверяем дорожки...');
        var hasAudio = await probeAudio(ffmpeg, inputPath);
        setProgress(0.44, 'Кодируем видео...');

        var onProgress = function (event) {
          var p = Number(event.progress) || 0;
          setProgress(0.45 + p * 0.5, 'Кодируем видео... ' + Math.round(p * 100) + '%');
        };
        var onLog = function (event) {
          var match = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(event.message || '');
          if (match && length > 0) {
            var seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
            setProgress(0.45 + Math.min(1, seconds / length) * 0.5, 'Кодируем видео...');
          }
        };
        ffmpeg.on('progress', onProgress);
        ffmpeg.on('log', onLog);

        try {
          await ffmpeg.exec(buildArgs(inputPath, outputName, hasAudio, start, length));
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
            (outputBlob.size < file.size ? ', вес уменьшен' : ', вес может отличаться от исходника');
        }
        if (download) download.disabled = false;
        toast('Видео готово', formatBytes(outputBlob.size) + ' - MP4, ' + formatTime(length));
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
