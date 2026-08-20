/* Tesla XTeam FX Trade — i18n */
(function () {
  'use strict';

  var LANGS = [
    { code: 'en', label: '🇺🇸 English',  file: 'en.json' },
    { code: 'es', label: '🇪🇸 Español',   file: 'es.json' },
    { code: 'fr', label: '🇫🇷 Français',  file: 'fr.json' },
    { code: 'de', label: '🇩🇪 Deutsch',   file: 'de.json' },
    { code: 'pt', label: '🇧🇷 Português', file: 'pt.json' },
    { code: 'zh', label: '🇨🇳 中文',     file: 'zh.json' },
    { code: 'ar', label: '🇸🇦 العربية',  file: 'ar.json' },
    { code: 'ru', label: '🇷🇺 Русский',  file: 'ru.json' }
  ];

  var translations = {};
  var currentLang = 'en';

  function resolveBase() {
    if (typeof __I18N_BASE__ !== 'undefined') return __I18N_BASE__;
    var s = document.currentScript && document.currentScript.src;
    if (s) return s.slice(0, s.lastIndexOf('/') + 1);
    return './';
  }

  function detectLang() {
    var stored = (localStorage.getItem('i18n_lang') || '').trim().toLowerCase();
    if (stored && LANGS.some(function (l) { return l.code === stored; })) return stored;
    var nav = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
    var code = nav.slice(0, 2);
    if (LANGS.some(function (l) { return l.code === code; })) return code;
    return 'en';
  }

  function applyTranslations() {
    var nodes = document.querySelectorAll('[data-i18n]');
    nodes.forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (!key) return;
      var parts = key.split('.');
      var val = translations;
      for (var i = 0; i < parts.length; i++) {
        if (val == null) break;
        val = val[parts[i]];
      }
      if (typeof val === 'string') {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          if ('placeholder' in el) el.placeholder = val;
        } else {
          el.innerHTML = val;
        }
      }
    });
  }

  function setLang(lang) {
    if (!LANGS.some(function (l) { return l.code === lang; })) return;
    currentLang = lang;
    localStorage.setItem('i18n_lang', lang);
    document.documentElement.setAttribute('lang', lang);
    window.dispatchEvent(new CustomEvent('i18n:changed', { detail: { lang: lang } }));
    if (Object.keys(translations).length) applyTranslations();
  }

  function t(key) {
    var parts = key.split('.');
    var val = translations;
    for (var i = 0; i < parts.length; i++) {
      if (val == null) break;
      val = val[parts[i]];
    }
    return typeof val === 'string' ? val : key;
  }

  function langSwitcherHtml() {
    var base = resolveBase();
    var items = LANGS.map(function (l) {
      var cls = l.code === currentLang ? 'bg-white/20' : 'hover:bg-white/10';
      return '<button type="button" data-i18n-lang="' + l.code + '" class="w-full text-left px-3 py-1.5 text-sm text-white transition ' + cls + '">' + l.label + '</button>';
    }).join('');
    return (
      '<div class="relative" id="lang-switcher">' +
        '<button type="button" id="lang-btn" class="inline-flex items-center rounded-full border border-white/20 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/10">' +
          '<span id="lang-btn-label">' + (function () {
            var l = LANGS.find(function (x) { return x.code === currentLang; }) || LANGS[0];
            return l.label;
          })() + '</span>' +
          '<i data-lucide="chevron-down" class="ml-1 w-3 h-3"></i>' +
        '</button>' +
        '<div id="lang-menu" class="hidden absolute bottom-full right-0 z-50 mb-2 w-40 overflow-hidden rounded-xl border border-white/10 bg-navy-950 shadow-xl">' +
          items +
        '</div>' +
      '</div>'
    );
  }

  function initSwitcher(root) {
    root = root || document;
    var switcher = root.querySelector('#lang-switcher');
    if (!switcher) return;
    if (!switcher.querySelector('#lang-btn')) {
      switcher.innerHTML = (function () {
        var items = LANGS.map(function (l) {
          var cls = l.code === currentLang ? 'bg-white/20' : 'hover:bg-white/10';
          return '<button type="button" data-i18n-lang="' + l.code + '" class="w-full text-left px-3 py-1.5 text-sm text-white transition ' + cls + '">' + l.label + '</button>';
        }).join('');
        return (
          '<button type="button" id="lang-btn" class="inline-flex items-center rounded-full border border-white/20 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/10">' +
            '<span id="lang-btn-label">' + (function () {
              var l = LANGS.find(function (x) { return x.code === currentLang; }) || LANGS[0];
              return l.label;
            })() + '</span>' +
            '<i data-lucide="chevron-down" class="ml-1 w-3 h-3"></i>' +
          '</button>' +
          '<div id="lang-menu" class="hidden absolute bottom-full right-0 z-50 mb-2 w-40 overflow-hidden rounded-xl border border-white/10 bg-navy-950 shadow-xl">' +
            items +
          '</div>'
        );
      })();
    }
    var btn = switcher.querySelector('#lang-btn');
    var menu = switcher.querySelector('#lang-menu');
    var label = switcher.querySelector('#lang-btn-label');
    if (!btn || !menu) return;

    btn.addEventListener('click', function () {
      var open = !menu.classList.contains('hidden');
      if (open) { menu.classList.add('hidden'); return; }
      menu.classList.remove('hidden');
    });

    menu.addEventListener('click', function (e) {
      var b = e.target.closest('[data-i18n-lang]');
      if (!b) return;
      var lang = b.getAttribute('data-i18n-lang');
      setLang(lang);
      var match = LANGS.find(function (x) { return x.code === lang; });
      if (match && label) label.textContent = match.label;
      menu.classList.add('hidden');
    });

    document.addEventListener('click', function (e) {
      if (!switcher.contains(e.target)) menu.classList.add('hidden');
    });
  }

  function bootstrap() {
    var base = resolveBase();

    if (window.__I18N_TRANSLATIONS__ && window.__I18N_TRANSLATIONS_LANG__) {
      currentLang = window.__I18N_TRANSLATIONS_LANG__;
      translations = window.__I18N_TRANSLATIONS__;
      setLang(currentLang);
      initSwitcher(document);
      return;
    }

    currentLang = detectLang();
    document.documentElement.setAttribute('lang', currentLang);

    fetch(base + 'assets/i18n/' + currentLang + '.json')
      .then(function (r) { if (!r.ok) throw new Error('Missing ' + currentLang); return r.json(); })
      .then(function (data) {
        translations = data;
        setLang(currentLang);
        initSwitcher(document);
      })
      .catch(function () {
        return fetch(base + 'assets/i18n/en.json')
          .then(function (r) { return r.json(); })
          .then(function (data) {
            translations = data;
            setLang('en');
            initSwitcher(document);
          });
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

  window.setLanguage = setLang;
  window.t = t;
})();
