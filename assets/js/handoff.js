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
    var file = new File([data.blob], data.name || 'video.mp4', { type: data.type || 'video/mp4' });
    var transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));

    var attempts = 0;
    (function wait() {
      if (applyTrim(data)) return;
      if (++attempts < 180) requestAnimationFrame(wait);
    })();
  }

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
