// Переход между страницами: обложка шоу «перелетает» с главной на страницу шоу и обратно,
// только когда это то же шоу. Обычный файл (не встроенный) — чтобы не ослаблять защиту CSP.
(function () {
  var name = function (path) {
    document.querySelectorAll('[data-vt-poster]').forEach(function (el) {
      el.style.viewTransitionName = el.getAttribute('data-vt-poster') === path ? 'poster' : '';
    });
  };
  var path = function (u) { try { return new URL(u).pathname; } catch (e) { return ''; } };
  window.addEventListener('pageswap', function (e) {
    if (e.viewTransition && e.activation && e.activation.entry) name(path(e.activation.entry.url));
  });
  window.addEventListener('pagereveal', function (e) {
    if (!e.viewTransition) return;
    var from = navigation.activation && navigation.activation.from ? path(navigation.activation.from.url) : '';
    document.querySelectorAll('[data-vt-poster]').forEach(function (el) {
      var p = el.getAttribute('data-vt-poster');
      el.style.viewTransitionName = (p === location.pathname || p === from) ? 'poster' : '';
    });
    e.viewTransition.finished.then(function () { name(''); });
  });
})();
