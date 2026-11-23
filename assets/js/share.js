/* VidSlice - shareable project links. Video is uploaded only when the user asks for it. */
(function () {
  'use strict';

  var API = 'https://tempfile.org/api';
  var PUBLIC_ORIGIN = 'https://vidslice.run.place';
  var PROJECT_ID_RE = /^[A-Za-z0-9_-]{8,20}$/;
  var SETTINGS_KEY = 'vidslice-share-settings';
  var CHUNK_SIZE = 100 * 1024 * 1024;
  var META_RESERVE = 64 * 1024;
  var MAX_PARTS = 50;
  var MAX_BYTES = MAX_PARTS * CHUNK_SIZE - META_RESERVE;
  var PART_RE = /^video\.part-(\d{3})\.bin$/;
  var activeFile = null;
  var busy = 0;

  function beginWork() { busy++; }
  function endWork() { busy = Math.max(0, busy - 1); }

  window.addEventListener('beforeunload', function (event) {
    if (!busy) return;
    event.preventDefault();
    event.returnValue = '';
    return '';
  });

  function byId(id) { return document.getElementById(id); }
  function query(sel) { return document.querySelector(sel); }
  function queryAll(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function isFullEditor() { return !!byId('fileInput') && !!byId('video'); }
  function isEditor() { return document.body.dataset.page === 'editor' && !!byId('videoInput'); }
  function isErrorPage() { return document.body.dataset.page === 'error'; }

  function parseTime(value) {
    var parts = String(value == null ? '' : value).trim().replace(',', '.').split(':');
    if (!parts.length || parts.length > 3) return NaN;
    var total = 0;
    for (var i = 0; i < parts.length; i++) {
      var part = parseFloat(parts[i]);
      if (!isFinite(part)) return NaN;
      total = total * 60 + part;
    }
    return total;
  }

  function activeValue(attr) {
    var node = query('[data-' + attr + '].is-active');
    return node ? node.getAttribute('data-' + attr) || '' : '';
  }

  function parseJson(response) {
    return response.text().then(function (text) {
      var data = null;
      try { data = JSON.parse(text); } catch (error) { /* ignore */ }
      if (!response.ok || !data || data.success === false) {
        throw new Error((data && (data.error || data.message)) || ('HTTP ' + response.status));
      }
      return data;
    });
  }

  function api(path, options) {
    return fetch(API + path, options).then(parseJson);
  }

  function fetchJson(url) {
    return fetch(url).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    });
  }

  function fetchBlob(url) {
    return fetch(url).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.blob();
    });
  }

  function fetchBuffer(url) {
    return fetch(url).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.arrayBuffer();
    });
  }

  function partName(index) {
    return 'video.part-' + ('000' + index).slice(-3) + '.bin';
  }

  function encodeMeta(meta) {
    var bytes = new TextEncoder().encode(JSON.stringify(meta));
    if (bytes.length > META_RESERVE) throw new Error('Настройки проекта слишком большие.');
    var header = new Uint8Array(4);
    header[0] = bytes.length & 255;
    header[1] = (bytes.length >>> 8) & 255;
    header[2] = (bytes.length >>> 16) & 255;
    header[3] = (bytes.length >>> 24) & 255;
    return new Blob([header, bytes], { type: 'application/octet-stream' });
  }

  function decodeMeta(buffer) {
    var view = new DataView(buffer);
    var length = view.getUint32(0, true);
    if (!length || length > META_RESERVE || 4 + length > buffer.byteLength) {
      throw new Error('Не удалось прочитать настройки проекта.');
    }
    var meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, length)));
    var videoPart = new Blob([new Uint8Array(buffer, 4 + length)], { type: 'application/octet-stream' });
    return { meta: meta, videoPart: videoPart };
  }

  function rememberFile() {
    var input = byId('fileInput') || byId('videoInput');
    if (input && input.files && input.files[0]) activeFile = input.files[0];
  }

  function openDb() {
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

  function savePending(data) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('pending', 'readwrite');
        tx.objectStore('pending').put(data, 'video');
        tx.oncomplete = function () { db.close(); resolve(); };
        tx.onerror = function () { db.close(); reject(tx.error); };
      });
    });
  }

  function readPending() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('pending', 'readonly');
        var request = tx.objectStore('pending').get('video');
        request.onsuccess = function () { resolve(request.result || null); };
        request.onerror = function () { reject(request.error); };
        tx.oncomplete = function () { db.close(); };
      });
    });
  }

  function clearPending() {
    return openDb().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction('pending', 'readwrite');
        tx.objectStore('pending').delete('video');
        tx.oncomplete = function () { db.close(); resolve(); };
        tx.onerror = function () { db.close(); resolve(); };
      });
    });
  }

  function toast(title, sub, kind) {
    var stack = query('.vs-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'vs-toast-stack';
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }
    var node = document.createElement('div');
    node.className = 'vs-toast' + (kind === 'error' ? ' vs-toast--error' : '');
    node.setAttribute('role', 'status');
    node.innerHTML = '<span class="vs-toast__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5 10-11"/></svg></span>' +
      '<span class="vs-toast__body"><span class="vs-toast__title"></span><span class="vs-toast__sub"></span></span><i class="vs-toast__life"></i>';
    node.querySelector('.vs-toast__title').textContent = title;
    var subNode = node.querySelector('.vs-toast__sub');
    if (sub) subNode.textContent = sub; else subNode.remove();
    stack.appendChild(node);
    while (stack.children.length > 3) stack.firstChild.remove();
    setTimeout(function () { node.classList.add('is-leaving'); setTimeout(function () { node.remove(); }, 320); }, 4600);
  }

  function currentVideoInfo() {
    var full = isFullEditor();
    var video = full ? byId('video') : byId('videoPreview');
    if (!video || !video.src || video.src.indexOf('blob:') !== 0) return null;
    var name = full
      ? ((byId('projectName') || {}).value || 'Новый проект')
      : ((byId('videoName') || {}).textContent || 'video.mp4');
    var start = NaN;
    var end = NaN;
    var settings = {};

    if (full) {
      start = parseTime((byId('startInput') || {}).value);
      end = parseTime((byId('endInput') || {}).value);
      settings.mode = activeValue('mode');
      settings.quality = activeValue('quality');
      settings.compress = !!(byId('compressToggle') || {}).checked;
      settings.compressPercent = Number((byId('compressRange') || {}).value) || 50;
    } else {
      start = Number((byId('trimStart') || {}).value);
      end = Number((byId('trimEnd') || {}).value);
      settings.mode = (byId('exportMode') || {}).value || 'optimal';
      settings.quality = (byId('videoQuality') || {}).value || 'source';
      settings.compress = !!(byId('videoCompress') || {}).checked;
    }

    return {
      blobUrl: video.src,
      file: activeFile,
      name: String(name).trim() || 'video.mp4',
      start: isFinite(start) ? start : 0,
      end: isFinite(end) ? end : 0,
      settings: settings,
      target: full ? '/full-editor.html' : '/editor'
    };
  }

  function syncShareButton() {
    var button = byId('shareProjectBtn');
    if (!button) return;
    var ready = !!currentVideoInfo();
    if (button.hidden === !ready) return;
    button.hidden = !ready;
    button.disabled = !ready;
    button.title = ready ? 'Создать ссылку на проект с видео' : 'Сначала загрузите видео';
  }

  function makeModal() {
    var old = byId('shareProjectModal');
    if (old) old.remove();
    var wrap = document.createElement('div');
    wrap.className = 'modal share-modal';
    wrap.id = 'shareProjectModal';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'shareProjectTitle');
    wrap.innerHTML = '' +
      '<div class="modal__box share-modal__box">' +
      '  <div class="modal__head">' +
      '    <h2 class="modal__title" id="shareProjectTitle">Поделиться проектом</h2>' +
      '    <button class="modal__close" type="button" data-share-close aria-label="Закрыть">&times;</button>' +
      '  </div>' +
      '  <div class="share-modal__body">' +
      '    <p class="share-modal__hint">Видео и настройки монтажа будут загружены во временное хранилище на 24 часа. Ссылка доступна всем, у кого она есть.</p>' +
      '    <div class="share-modal__status" data-share-status>Готово к публикации.</div>' +
      '    <div class="share-modal__bar" aria-hidden="true"><i data-share-bar></i></div>' +
      '    <div class="share-modal__link" data-share-link-wrap hidden>' +
      '      <label for="shareProjectLink">Ссылка на проект</label>' +
      '      <div class="share-modal__row">' +
      '        <input id="shareProjectLink" type="text" readonly data-share-link>' +
      '        <button class="btn btn--primary btn--sm" type="button" data-share-copy>Копировать</button>' +
      '      </div>' +
      '    </div>' +
      '    <p class="share-modal__note">Поддерживаются файлы до 5 ГБ. Без видео ссылка не создаётся.</p>' +
      '  </div>' +
      '  <div class="share-modal__actions">' +
      '    <button class="btn btn--primary" type="button" data-share-publish>Создать ссылку</button>' +
      '    <button class="btn" type="button" data-share-native hidden>Поделиться через браузер</button>' +
      '    <button class="btn" type="button" data-share-close>Закрыть</button>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(wrap);
    return wrap;
  }

  function fallbackCopy(input) {
    input.removeAttribute('readonly');
    input.select();
    try { document.execCommand('copy'); toast('Скопировано', input.value); } catch (error) { /* ignore */ }
    input.setAttribute('readonly', 'readonly');
  }

  function openShareModal() {
    var info = currentVideoInfo();
    if (!info) {
      toast('Нет видео', 'Сначала загрузите видео в редактор.', 'error');
      return;
    }
    var modal = makeModal();
    var statusNode = modal.querySelector('[data-share-status]');
    var bar = modal.querySelector('[data-share-bar]');
    var linkWrap = modal.querySelector('[data-share-link-wrap]');
    var linkInput = modal.querySelector('[data-share-link]');
    var publishBtn = modal.querySelector('[data-share-publish]');
    var nativeBtn = modal.querySelector('[data-share-native]');

    function close() {
      if (busy) return;
      modal.classList.add('is-closing');
      setTimeout(function () { modal.remove(); }, 230);
    }

    queryAll('[data-share-close]', modal).forEach(function (node) { node.addEventListener('click', close); });
    modal.addEventListener('click', function (event) { if (event.target === modal) close(); });

    publishBtn.addEventListener('click', async function () {
      if (busy) return;
      beginWork();
      publishBtn.disabled = true;
      linkWrap.hidden = true;
      nativeBtn.hidden = true;
      bar.classList.add('is-running');
      statusNode.textContent = 'Загружаем видео и настройки...';

      try {
        var source = info.file || await fetchBlob(info.blobUrl);
        if (!source.size) throw new Error('Видеофайл пуст.');
        if (source.size > MAX_BYTES) throw new Error('Файл больше 5 ГБ. Такой проект нельзя опубликовать.');

        var meta = {
          app: 'vidslice',
          version: 1,
          target: info.target,
          name: info.name,
          type: source.type || 'video/mp4',
          size: source.size,
          start: info.start,
          end: info.end,
          settings: info.settings,
          created: Date.now()
        };

        statusNode.textContent = 'Создаём временную папку...';
        var folderRes = await api('/folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expiryHours: 24, title: info.name.slice(0, 80) })
        });
        var folder = folderRes.folder;
        if (!folder || !folder.id || !folder.manageToken) throw new Error('Хранилище не вернуло папку проекта.');

        statusNode.textContent = 'Готовим части проекта...';
        var metaBlob = encodeMeta(meta);
        var firstSize = CHUNK_SIZE - metaBlob.size;
        var parts = [new Blob([metaBlob, source.slice(0, firstSize)], { type: 'application/octet-stream' })];
        for (var offset = firstSize; offset < source.size; offset += CHUNK_SIZE) {
          parts.push(source.slice(offset, Math.min(offset + CHUNK_SIZE, source.size)));
        }
        if (parts.length > MAX_PARTS) throw new Error('Проект слишком большой для ссылки.');

        for (var i = 0; i < parts.length; i++) {
          statusNode.textContent = 'Публикуем проект... часть ' + (i + 1) + ' из ' + parts.length;
          var form = new FormData();
          form.append('files', parts[i], partName(i));
          form.append('folderId', folder.id);
          form.append('folderToken', folder.manageToken);
          var uploaded = await api('/upload/local', { method: 'POST', body: form });
          if (!uploaded || !uploaded.success) throw new Error('Не удалось загрузить проект.');
        }

        var check = await api('/folder/' + encodeURIComponent(folder.id));
        var names = (check.files || []).map(function (file) { return file.name; })
          .filter(function (name) { return PART_RE.test(name); });
        if (names.length !== parts.length) throw new Error('Проект загружен не полностью.');

        var link = PUBLIC_ORIGIN + '/' + folder.id;
        linkInput.value = link;
        linkWrap.hidden = false;
        nativeBtn.hidden = false;
        statusNode.textContent = 'Готово. Ссылка действует 24 часа.';
        bar.classList.remove('is-running');

        nativeBtn.onclick = function () {
          if (!navigator.share) { toast('Не поддерживается', 'Скопируйте ссылку вручную.', 'error'); return; }
          navigator.share({ title: 'VidSlice - проект', url: link }).catch(function () { /* ignore */ });
        };
        toast('Ссылка готова', folder.id);
      } catch (error) {
        statusNode.textContent = (error && error.message) || 'Не удалось создать ссылку.';
        bar.classList.remove('is-running');
        toast('Ошибка публикации', (error && error.message) || '', 'error');
      } finally {
        publishBtn.disabled = false;
        endWork();
      }
    });

    modal.querySelector('[data-share-copy]').addEventListener('click', function () {
      var value = linkInput.value;
      if (!value) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).then(function () { toast('Скопировано', value); }, function () { fallbackCopy(linkInput); });
      } else {
        fallbackCopy(linkInput);
      }
    });

    modal.classList.add('is-open');
    setTimeout(function () { modal.querySelector('[data-share-publish]').focus(); }, 30);
  }

  function addShareButton() {
    if (byId('shareProjectBtn')) return;
    var host = query('.topbar__actions') || query('.toolbar .top-controls');
    if (!host) return;
    var button = document.createElement('button');
    button.className = 'btn btn--sm share-project-btn';
    button.id = 'shareProjectBtn';
    button.type = 'button';
    button.title = 'Создать ссылку на проект с видео';
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="m8.4 10.8 7.2-4.1M8.4 13.2l7.2 4.1"/></svg><span>Поделиться</span>';
    host.insertBefore(button, host.firstChild);
    button.addEventListener('click', openShareModal);

    button.hidden = true;
    button.disabled = true;
    button.title = 'Сначала загрузите видео';
    syncShareButton();

    [byId('video'), byId('videoPreview'), byId('fileInput'), byId('videoInput')]
      .filter(Boolean)
      .forEach(function (node) {
        ['loadedmetadata', 'loadeddata', 'canplay', 'emptied', 'change'].forEach(function (type) {
          node.addEventListener(type, function () {
            setTimeout(function () { rememberFile(); syncShareButton(); }, 60);
          });
        });
      });
    setInterval(syncShareButton, 600);
  }

  function clickSetting(attr, value) {
    if (!value) return;
    var node = query('[data-' + attr + '="' + value + '"]');
    if (node && !node.classList.contains('is-active')) node.click();
  }

  function applySettings(meta) {
    if (!meta || !meta.settings) return;
    var s = meta.settings;

    if (isEditor()) {
      var start = byId('trimStart');
      var end = byId('trimEnd');
      var video = byId('videoPreview');
      var applyRange = function () {
        if (end && isFinite(meta.end)) end.value = Math.max(0, meta.end);
        if (start && isFinite(meta.start)) start.value = Math.max(0, meta.start);
        if (start) start.dispatchEvent(new Event('input', { bubbles: true }));
      };
      if (video && !isFinite(video.duration)) video.addEventListener('loadedmetadata', applyRange, { once: true });
      else applyRange();
      var mode = byId('exportMode');
      if (mode && s.mode) { mode.value = s.mode; mode.dispatchEvent(new Event('change', { bubbles: true })); }
      if (byId('videoQuality') && s.quality) byId('videoQuality').value = s.quality;
      if (byId('videoCompress')) byId('videoCompress').checked = !!s.compress;
      return;
    }

    if (isFullEditor()) {
      if (byId('projectName') && meta.name) byId('projectName').value = String(meta.name).replace(/\.[^.]+$/, '').slice(0, 48);
      clickSetting('mode', s.mode);
      clickSetting('quality', s.quality);
      var compressToggle = byId('compressToggle');
      if (compressToggle && compressToggle.checked !== !!s.compress) compressToggle.click();
      if (byId('compressRange') && s.compressPercent) {
        var range = byId('compressRange');
        range.value = s.compressPercent;
        range.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  function readSettings() {
    try { return JSON.parse(sessionStorage.getItem(SETTINGS_KEY) || 'null'); } catch (error) { return null; }
  }

  function restoreSharedVideo() {
    var settings = readSettings();
    try { sessionStorage.removeItem(SETTINGS_KEY); } catch (error) { /* ignore */ }
    if (!settings) return;

    if (isFullEditor()) {
      setTimeout(function () {
        applySettings(settings);
        toast('Проект открыт', settings.name || 'Настройки восстановлены');
      }, 900);
      return;
    }

    if (!isEditor()) return;
    readPending().then(function (data) {
      if (!data || !data.blob) return;
      var file = new File([data.blob], data.name || 'video.mp4', { type: data.type || 'video/mp4' });
      var transfer = new DataTransfer();
      transfer.items.add(file);
      var input = byId('videoInput');
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));

      var meta = {
        start: data.start,
        end: data.end,
        settings: settings.settings || {},
        name: data.name || settings.name
      };
      var video = byId('videoPreview');
      var apply = function () {
        applySettings(meta);
        toast('Проект открыт', data.name || 'Видео восстановлено');
      };
      if (video && !isFinite(video.duration)) video.addEventListener('loadedmetadata', apply, { once: true });
      else setTimeout(apply, 80);
      return clearPending().catch(function () { /* ignore */ });
    }).catch(function () { /* без переданного файла редактор открывается как обычно */ });
  }

  function showLoadingPage() {
    document.documentElement.classList.add('is-project-loading');
    document.documentElement.classList.remove('is-project-error');
    var loader = byId('projectLoader');
    if (loader) loader.setAttribute('aria-busy', 'true');
    document.title = 'Загружаем проект - VidSlice';
    statusNode('Соединяемся с хранилищем...');
  }

  function showErrorPage(code, title, text, link) {
    var main = query('.error-page');
    if (!main) return;
    document.documentElement.classList.remove('is-project-loading');
    document.documentElement.classList.add('is-project-error');
    var loader = byId('projectLoader');
    if (loader) loader.setAttribute('aria-busy', 'false');
    var codeNode = query('.error-page__code');
    var titleNode = query('.error-page h1');
    var textNode = query('.error-page p');
    if (codeNode) codeNode.textContent = code;
    if (titleNode) titleNode.textContent = title;
    if (textNode) {
      textNode.textContent = text;
      var oldLink = query('.route-error__link');
      if (oldLink) oldLink.remove();
      if (link) {
        var linkNode = document.createElement('a');
        linkNode.className = 'route-error__link';
        linkNode.href = link;
        linkNode.textContent = link;
        textNode.parentNode.insertBefore(linkNode, textNode.nextSibling);
      }
    }
    main.classList.add('route-error');
    document.title = 'Ошибка ' + code + ' - VidSlice';
  }

  function statusNode(text) {
    var loaderText = byId('projectLoaderText');
    if (loaderText && document.documentElement.classList.contains('is-project-loading')) {
      loaderText.textContent = text;
    }
    var node = query('.route-error__status');
    if (!node) {
      node = document.createElement('div');
      node.className = 'route-error__status';
      var main = query('.error-page');
      if (main) main.appendChild(node);
    }
    node.textContent = text;
  }

  async function restoreFromLink() {
    if (!isErrorPage()) return;
    var path = '';
    try { path = decodeURIComponent(location.pathname || ''); } catch (error) { path = location.pathname || ''; }
    var segment = path.replace(/^\/+|\/+$/g, '');
    if (!segment || segment.indexOf('/') !== -1 || segment.indexOf('.') !== -1) return;

    var validId = PROJECT_ID_RE.test(segment);
    var link = location.href;
    if (!validId) {
      showErrorPage(
        '404',
        'Такой ссылки нет',
        'Проверьте адрес или вернитесь на главную.',
        link
      );
      statusNode('Ссылка не найдена.');
      return;
    }

    showLoadingPage();
    var done = false;
    beginWork();
    try {
      statusNode('Проверяем ссылку...');
      var info = await api('/folder/' + encodeURIComponent(segment));
      var files = info.files || [];
      var parts = files.filter(function (file) { return PART_RE.test(file.name); })
        .sort(function (a, b) {
          return Number(PART_RE.exec(a.name)[1]) - Number(PART_RE.exec(b.name)[1]);
        });
      var meta = null;
      var blob = null;
      var videoName = 'video.mp4';

      if (parts.length) {
        statusNode('Загружаем настройки проекта...');
        var firstBuffer = await fetchBuffer(parts[0].downloadUrl);
        var decoded = decodeMeta(firstBuffer);
        meta = decoded.meta;
        videoName = meta.name || videoName;
        var videoParts = [decoded.videoPart];
        for (var i = 1; i < parts.length; i++) {
          statusNode('Загружаем видео... часть ' + (i + 1) + ' из ' + parts.length);
          videoParts.push(await fetchBlob(parts[i].downloadUrl));
        }
        blob = new Blob(videoParts, { type: meta.type || 'video/mp4' });
      } else {
        var metaFile = null;
        var videoFile = null;
        files.forEach(function (file) {
          if (file.name === 'project.json') metaFile = file;
          else if (!videoFile) videoFile = file;
        });
        if (!metaFile || !videoFile) throw new Error('В ссылке нет проекта.');
        statusNode('Загружаем настройки проекта...');
        meta = await fetchJson(metaFile.downloadUrl);
        statusNode('Загружаем видео...');
        blob = await fetchBlob(videoFile.downloadUrl);
        videoName = meta.name || videoFile.name || videoName;
      }
      if (!blob.size) throw new Error('Видеофайл пуст.');
      await savePending({
        blob: blob,
        name: videoName,
        type: meta.type || 'video/mp4',
        start: meta.start,
        end: meta.end
      });
      try { sessionStorage.setItem(SETTINGS_KEY, JSON.stringify(meta || {})); } catch (error) { /* ignore */ }

      statusNode('Открываем редактор...');
      done = true;
      endWork();
      location.replace(meta && meta.target === '/full-editor.html' ? '/full-editor.html' : '/editor');
    } catch (error) {
      showErrorPage(
        '410',
        'Ссылка больше не работает',
        'Срок действия проекта истёк или он был удалён.',
        link
      );
      statusNode('Проект больше не доступен.');
    } finally {
      if (!done) endWork();
    }
  }

  function init() {
    if (isErrorPage()) { restoreFromLink(); return; }
    if (isEditor() || isFullEditor()) { rememberFile(); addShareButton(); restoreSharedVideo(); }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
