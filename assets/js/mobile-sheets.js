/* VidSlice - mobile bottom sheets with a drag handle. */
(function () {
  'use strict';

  var root = document.documentElement;
  var query = null;
  var scanQueued = false;

  var configs = [
    { selector: '#exportModal', panel: '.modal__card', close: '#exportModalClose' },
    { selector: '#accountModal', panel: '.account-shell', close: '#accountClose' },
    { selector: '#accountConfirm', panel: '.account-confirm__card', close: '#accountConfirmCancel' },
    { selector: '#avatarCropper', panel: '.avatar-cropper__card', close: '#avatarCropperCancel' },
    { selector: '#projectsModal', panel: '.projects-gallery', close: '#projectsClose' },
    { selector: '#helpModal', panel: '.modal__card--help', close: '#helpClose' },
    { selector: '#hotkeySheet', panel: '.hotkey-sheet__card', close: '.hotkey-sheet__close' },
    { selector: '#photoModal', panel: '.photo-screen__shell', close: '#photoModalClose' },
    { selector: '.picker', panel: '.picker__box', close: '[data-picker-close]' },
    { selector: '.modal', panel: '.modal__box', close: '[data-account-close]' }
  ];

  function isVisible(node) {
    if (!node || node.hidden) return false;
    var style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (node.classList.contains('is-hidden')) return false;
    if (node.classList.contains('picker') || (node.classList.contains('modal') && node.querySelector('.modal__box'))) {
      return node.classList.contains('is-open');
    }
    return true;
  }

  function findConfig(node) {
    for (var i = 0; i < configs.length; i++) {
      var cfg = configs[i];
      if (cfg.selector.charAt(0) === '#') {
        if (node.id === cfg.selector.slice(1)) return cfg;
      } else if (node.classList.contains(cfg.selector.slice(1))) {
        if (cfg.panel === '.modal__box' && !node.querySelector('.modal__box')) continue;
        return cfg;
      }
    }
    return null;
  }

  function addGrip(panel, node, cfg) {
    var grip = null;
    for (var i = 0; i < panel.children.length; i++) {
      if (panel.children[i].classList && panel.children[i].classList.contains('vs-sheet-grip')) {
        grip = panel.children[i];
        break;
      }
    }
    if (grip) return;

    grip = document.createElement('div');
    grip.className = 'vs-sheet-grip';
    grip.setAttribute('aria-hidden', 'true');
    grip.innerHTML = '<span></span>';
    panel.insertBefore(grip, panel.firstChild);
    grip.addEventListener('pointerdown', function (event) {
      startDrag(event, node, panel, cfg);
    });
  }

  function closeSheet(node, cfg) {
    panelReset(cfg.panelNode || null);
    var closer = node.querySelector(cfg.close);
    if (closer && typeof closer.click === 'function') {
      closer.click();
      return;
    }
    node.classList.remove('is-open', 'is-closing');
    node.hidden = true;
  }

  function panelReset(panel) {
    if (!panel) return;
    panel.classList.remove('vs-sheet-dragging');
    panel.style.transition = '';
    panel.style.transform = '';
  }

  function startDrag(event, node, panel, cfg) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.isPrimary === false) return;
    event.preventDefault();

    var pointerId = event.pointerId;
    var startY = event.clientY;
    var dy = 0;
    panel.classList.add('vs-sheet-dragging');
    panel.style.transition = 'none';
    try { if (event.target.setPointerCapture) event.target.setPointerCapture(pointerId); } catch (error) { }

    function move(moveEvent) {
      if (moveEvent.pointerId !== pointerId) return;
      dy = Math.max(0, moveEvent.clientY - startY);
      panel.style.transform = 'translateY(' + dy + 'px)';
      if (moveEvent.cancelable) moveEvent.preventDefault();
    }

    function finish(endEvent, shouldClose) {
      if (endEvent.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      var close = shouldClose && (dy > 84 || dy > panel.offsetHeight * 0.45);
      panel.style.transition = '';
      panel.style.transform = '';
      panel.classList.remove('vs-sheet-dragging');
      if (close) closeSheet(node, cfg);
    }

    function onUp(endEvent) {
      if (endEvent.pointerId === pointerId && isFinite(endEvent.clientY)) {
        dy = Math.max(0, endEvent.clientY - startY);
        panel.style.transform = 'translateY(' + dy + 'px)';
      }
      finish(endEvent, true);
    }
    function onCancel(endEvent) { finish(endEvent, false); }

    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

  function scan() {
    var nodes = document.querySelectorAll('.picker, .modal, .photo-modal, .account-confirm, .avatar-cropper, .hotkey-sheet');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (!isVisible(node)) continue;
      var cfg = findConfig(node);
      if (!cfg) continue;
      var panel = node.querySelector(cfg.panel);
      if (!panel) continue;
      cfg.panelNode = panel;
      addGrip(panel, node, cfg);
      node.classList.add('vs-sheet');
      panel.classList.add('vs-sheet__panel');
    }
  }

  function scheduleScan() {
    if (scanQueued) return;
    scanQueued = true;
    setTimeout(function () {
      scanQueued = false;
      scan();
    }, 0);
  }

  function update() {
    query = window.matchMedia ? window.matchMedia('(max-width: 820px)') : null;
    var mobile = query ? query.matches : window.innerWidth <= 820;
    root.classList.toggle('vs-sheets', mobile);
    if (mobile) scheduleScan();
  }

  function init() {
    update();
    if (window.MutationObserver) {
      var observer = new MutationObserver(scheduleScan);
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    }
    if (query) {
      if (query.addEventListener) query.addEventListener('change', update);
      else if (query.addListener) query.addListener(update);
    }
    window.addEventListener('resize', update);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
