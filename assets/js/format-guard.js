/* VidSlice - keep the selected photo format in the full editor. */
(function () {
  'use strict';

  var compressBtn = document.getElementById('photoCompressBtn');
  var formatSelect = document.getElementById('photoFormat');
  var chosenFormat = '';
  var originalToBlob = HTMLCanvasElement.prototype.toBlob;

  document.addEventListener('click', function (event) {
    if (!compressBtn || !formatSelect) return;
    var target = event.target;
    if (target === compressBtn || (target && compressBtn.contains && compressBtn.contains(target))) {
      chosenFormat = formatSelect.value;
    }
  }, true);

  HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
    var active = chosenFormat && compressBtn && compressBtn.disabled;
    if (active && /^image\/(jpeg|png|webp)$/.test(type || '')) {
      type = chosenFormat;
    }
    return originalToBlob.call(this, callback, type, quality);
  };
})();
