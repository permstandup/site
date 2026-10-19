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

// Браузеры без переходов между страницами (например, Firefox): мягкое затухание при уходе
// и проявление новой страницы — простыми средствами, с тем же ощущением.
(function () {
  if ('onpagereveal' in window) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var root = document.documentElement;
  root.classList.add('no-vt');
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.target || a.hasAttribute('download')) return;
    var url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.pathname === location.pathname) return;
    e.preventDefault();
    root.classList.add('vt-leaving');
    setTimeout(function () { location.href = url.href; }, 160);
  });
  // Возврат кнопкой «Назад» из кэша браузера — страница не должна остаться погашенной
  window.addEventListener('pageshow', function (e) { if (e.persisted) root.classList.remove('vt-leaving'); });
})();
