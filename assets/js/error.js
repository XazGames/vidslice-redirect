(function () {
  var button = document.getElementById('retryBtn');
  if (button) {
    button.addEventListener('click', function () {
      window.location.reload();
    });
  }
})();
