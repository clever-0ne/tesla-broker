(function () {
  var key = 'theme';
  var attr = 'data-theme';
  var root = document.documentElement;
  var stored = localStorage.getItem(key);
  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var theme = stored || (prefersDark ? 'dark' : 'light');
  if (theme === 'dark') root.setAttribute(attr, 'dark'); else root.removeAttribute(attr);

  function updateBtn() {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    var isDark = root.getAttribute(attr) === 'dark';
    btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.innerHTML = isDark ? '☀️' : '🌙';
  }

  window.toggleTheme = function () {
    var isDark = root.getAttribute(attr) === 'dark';
    var next = isDark ? 'light' : 'dark';
    if (next === 'dark') root.setAttribute(attr, 'dark'); else root.removeAttribute(attr);
    localStorage.setItem(key, next);
    updateBtn();
  };

  updateBtn();
})();
