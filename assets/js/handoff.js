/* Перенос видео и границ обрезки из мини-редактора в полный. */
(function () {
  'use strict';

  var DB_NAME = 'vidslice-handoff';

  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('IndexedDB недоступен')); return; }
      var request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = function () {
        if (!request.result.objectStoreNames.contains('pending')) {
          request.result.createObjectStore('pending');
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  function readPending(db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction('pending', 'readonly');
      var request = tx.objectStore('pending').get('video');
      request.onsuccess = function () { resolve(request.result || null); };
      request.onerror = function () { reject(request.error); };
    });
  }

  function clearPending(db) {
    return new Promise(function (resolve) {
      var tx = db.transaction('pending', 'readwrite');
      tx.objectStore('pending').delete('video');
      tx.oncomplete = resolve;
      tx.onerror = resolve;
      tx.onabort = resolve;
    });
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  var toastStack = null;

  function vsToast(title, sub) {
    if (!toastStack) {
      toastStack = document.createElement('div');
      toastStack.className = 'vs-toast-stack';
      toastStack.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastStack);
    }
    var node = document.createElement('div');
    node.className = 'vs-toast';
    node.setAttribute('role', 'status');
    node.innerHTML = '<span class="vs-toast__icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5 10-11"/></svg></span>' +
      '<span class="vs-toast__body"><span class="vs-toast__title"></span><span class="vs-toast__sub"></span></span>' +
      '<i class="vs-toast__life"></i>';
    node.querySelector('.vs-toast__title').textContent = title;
    var subNode = node.querySelector('.vs-toast__sub');
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

  var handoffActive = false;

  function watchUploads() {
    var video = document.getElementById('video');
    var input = document.getElementById('fileInput');
    if (!video || typeof MutationObserver === 'undefined') return;
    var last = video.getAttribute('src') || '';
    new MutationObserver(function () {
      var src = video.getAttribute('src') || '';
      if (!src || src === last) return;
      last = src;
      if (handoffActive) return;
      var name = input && input.files && input.files[0] ? input.files[0].name : '';
      vsToast('Видео загружено', name);
    }).observe(video, { attributes: true, attributeFilter: ['src'] });
  }

  function formatTime(t) {
    var ms = Math.max(0, Math.round(t * 1000));
    var h = Math.floor(ms / 3600000); ms -= h * 3600000;
    var m = Math.floor(ms / 60000); ms -= m * 60000;
    var s = Math.floor(ms / 1000); ms -= s * 1000;
    return pad(h) + ':' + pad(m) + ':' + pad(s) + '.' + String(ms).padStart(3, '0');
  }

  function applyTrim(data) {
    var video = document.getElementById('video');
    var startInput = document.getElementById('startInput');
    var endInput = document.getElementById('endInput');
    var segments = document.getElementById('segments');
    if (!video || !startInput || !endInput || !segments) return false;
    var duration = video.duration;
    if (!isFinite(duration) || duration <= 0) return false;
    if (!segments.querySelector('.segment-block')) return false;

    var end = Number(data.end);
    if (!isFinite(end) || end <= 0) end = duration;
    end = Math.min(duration, Math.max(0.05, end));

    var start = Number(data.start);
    if (!isFinite(start) || start < 0) start = 0;
    start = Math.min(end - 0.01, start);
    if (start < 0) start = 0;

    endInput.value = formatTime(end);
    endInput.dispatchEvent(new Event('change', { bubbles: true }));
    startInput.value = formatTime(start);
    startInput.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  function inject(data) {
    var input = document.getElementById('fileInput');
    if (!input || !data || !data.blob) return;
    handoffActive = true;
    var file = new File([data.blob], data.name || 'video.mp4', { type: data.type || 'video/mp4' });
    var transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));

    var attempts = 0;
    (function wait() {
      if (applyTrim(data)) {
        handoffActive = false;
        vsToast('Видео перенесено', 'Границы обрезки сохранены');
        return;
      }
      if (++attempts < 180) requestAnimationFrame(wait);
      else handoffActive = false;
    })();
  }

  watchUploads();

  openDb().then(function (db) {
    return readPending(db).then(function (data) {
      return clearPending(db).then(function () { return data; });
    }).then(function (data) {
      db.close();
      if (data) inject(data);
    }, function (error) {
      db.close();
      throw error;
    });
  }).catch(function () { /* без переданного файла редактор открывается как обычно */ });
})();
