/* VidSlice - pure client-side tools. One file, one style, no hidden routes. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  /* ---------- shared cursor field ---------- */

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
        var drift = reduceMotion ? 0 : Math.sin(time / 900 + d.phase) * 3;
        var x = d.x + (dx / dist) * pull;
        var y = d.y + (dy / dist) * pull + drift;
        ctx.beginPath();
        ctx.arc(x, y, d.r + force * 1.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,' + (0.18 + force * 0.55) + ')';
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

    if (!reduceMotion) requestAnimationFrame(frame);
    else if (glow) glow.style.transform = 'translate3d(' + pointer.x + 'px,' + pointer.y + 'px,0)';
  }

  /* ---------- photo tool ---------- */

  function initPhoto() {
    var input = $('photoInput');
    var drop = $('photoDrop');
    var preview = $('photoPreview');
    var before = $('photoBefore');
    var after = $('photoAfter');
    var saving = $('photoSaving');
    var format = $('photoFormat');
    var quality = $('photoQuality');
    var qualityValue = $('photoQualityValue');
    var size = $('photoSize');
    var button = $('photoCompress');
    var download = $('photoDownload');
    var result = $('photoResult');
    var error = $('photoError');
    if (!input) return;

    var job = { file: null, blob: null, name: '', url: '', resultType: '' };

    function resetResult() {
      if (job.url) URL.revokeObjectURL(job.url);
      job.url = '';
      job.blob = null;
      if (result) result.classList.remove('is-active');
      if (download) download.disabled = true;
      if (after) after.textContent = '-';
      if (saving) saving.textContent = '-';
    }

    function setFile(file) {
      if (!file || !file.type || file.type.indexOf('image/') !== 0) {
        showError(error, 'Нужен файл JPEG, PNG или WebP.');
        return;
      }
      showError(error, '');
      resetResult();
      job.file = file;
      job.name = file.name || 'photo.' + extFor(file.type);
      if (preview) {
        preview.hidden = false;
        preview.src = URL.createObjectURL(file);
      }
      if (before) before.textContent = formatBytes(file.size);
      if (button) button.disabled = false;
      if (drop) {
        var label = drop.querySelector('[data-drop-label]');
        if (label) label.textContent = job.name;
      }
    }

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

    async function compress() {
      if (!job.file) return;
      showError(error, '');
      if (button) { button.disabled = true; button.textContent = 'Сжимаем...'; }
      resetResult();
      try {
        var img = await loadImage(job.file);
        var max = Number(size ? size.value : 0) || 0;
        var scale = max > 0 ? Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)) : 1;
        var w = Math.max(1, Math.round(img.naturalWidth * scale));
        var h = Math.max(1, Math.round(img.naturalHeight * scale));
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);

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
        job.url = URL.createObjectURL(job.blob);
        if (preview) preview.src = job.url;
        if (after) after.textContent = formatBytes(job.blob.size);
        if (saving) {
          var saved = smaller ? Math.max(0, Math.round((1 - job.blob.size / job.file.size) * 100)) : 0;
          saving.textContent = saved > 0 ? '-' + saved + '%' : '0%';
        }
        if (result) {
          result.classList.add('is-active');
          var text = result.querySelector('[data-result-text]');
          if (text) text.textContent = smaller
            ? 'Файл меньше исходника. Формат результата подобран автоматически.'
            : 'Уменьшить не получилось, поэтому скачивается исходный файл без изменений.';
        }
        if (download) {
          download.disabled = false;
          download.textContent = 'Скачать ' + extFor(job.resultType).toUpperCase();
        }
      } catch (e) {
        showError(error, (e && e.message) || 'Не удалось сжать фото.');
      } finally {
        if (button) { button.disabled = !job.file; button.textContent = 'Сжать фото'; }
      }
    }

    input.addEventListener('change', function () { if (input.files && input.files[0]) setFile(input.files[0]); });
    if (button) button.addEventListener('click', compress);
    if (quality) quality.addEventListener('input', function () {
      if (qualityValue) qualityValue.textContent = quality.value + '%';
    });
    if (download) download.addEventListener('click', function () {
      if (!job.blob) return;
      var base = job.name.replace(/\.[^.]+$/, '');
      downloadBlob(job.blob, base + '-optimized.' + extFor(job.resultType));
    });

    if (drop) {
      drop.addEventListener('click', function () { input.click(); });
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
    if (!input) return;

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
      }
      if (name) name.textContent = next.name;
      if (drop) {
        var label = drop.querySelector('[data-drop-label]');
        if (label) label.textContent = next.name;
      }
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
      if (preset === '1080') return "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1";
      if (preset === '720') return "scale=w='min(1280,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1";
      if (preset === '480') return "scale=w='min(854,iw)':h='min(480,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1";
      return 'setsar=1';
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

    input.addEventListener('change', function () { if (input.files && input.files[0]) setFile(input.files[0]); });
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
    });
    [startSlider, endSlider].forEach(function (slider) { if (slider) slider.addEventListener('input', updateTrim); });
    if (exportBtn) exportBtn.addEventListener('click', exportVideo);
    if (download) download.addEventListener('click', function () {
      if (!outputBlob) return;
      var base = (file ? file.name : 'video').replace(/\.[^.]+$/, '');
      downloadBlob(outputBlob, base + '-vidslice.mp4');
    });

    if (drop) {
      drop.addEventListener('click', function () { input.click(); });
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
  }

  function init() {
    initCursorField();
    var page = document.body.dataset.page;
    if (page === 'photo') initPhoto();
    if (page === 'editor') initEditor();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
