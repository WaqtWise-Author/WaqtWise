'use strict';

// Runs right after the splash is in the page, before anything is drawn (1.7.1).
// The main process passes the saved theme and language to the page, so the splash is drawn in them from its first frame
// and does not change to them once the data has loaded. Without them (tests, a page opened alone) nothing changes here.

(function () {
  const boot = window.api && window.api.boot;
  const i18n = window.WWI18n;
  if (!boot || !i18n) return;
  const root = document.documentElement;
  if (boot.theme === 'light' || boot.theme === 'dark') root.dataset.theme = boot.theme;
  const language = i18n.setLanguage(boot.language);
  root.lang = language;
  root.dir = i18n.isRtl() ? 'rtl' : 'ltr';
  // The English text is kept on the element, as WW.applyLanguage does, so the language can still be switched later.
  for (const el of document.querySelectorAll('#splash [data-t]')) {
    el.dataset.tKey = el.textContent;
    el.textContent = i18n.t(el.textContent);
  }
  for (const el of document.querySelectorAll('#splash [data-t-label]')) {
    el.dataset.tLabelKey = el.getAttribute('aria-label') || '';
    el.setAttribute('aria-label', i18n.t(el.dataset.tLabelKey));
  }
})();
