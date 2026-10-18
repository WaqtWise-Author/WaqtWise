// WaqtWise website: works out the repository from the address, points the download links at the latest release, and shows
// its version number and size. No tracking. The only request is to GitHub's public API for the latest release.
(function () {
  'use strict';
  var cfg = window.WAQTWISE_SITE || {};
  var owner = cfg.owner, repo = cfg.repo, branch = cfg.branch || 'main';
  if (!owner || !repo) {
    var m = /^([a-z0-9-]+)\.github\.io$/i.exec(location.hostname);
    var first = location.pathname.split('/')[1];
    if (m && first && !/\./.test(first)) { owner = m[1]; repo = first; }
  }
  var base = owner && repo ? 'https://github.com/' + owner + '/' + repo : null;

  function fix(a) {
    var href = a.getAttribute('href') || '';
    if (href.indexOf('#repo:') !== 0) return;
    var path = href.slice(6);
    if (base) a.setAttribute('href', base + '/' + path);
    else { a.setAttribute('href', '#'); a.setAttribute('aria-disabled', 'true'); a.title = 'Set owner and repo in site/config.js'; }
  }
  Array.prototype.forEach.call(document.querySelectorAll('a[href^="#repo:"]'), fix);

  if (!owner || !repo || !window.fetch) return;
  fetch('https://api.github.com/repos/' + owner + '/' + repo + '/releases/latest', { headers: { Accept: 'application/vnd.github+json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (rel) {
      if (!rel || !rel.tag_name) return;
      var exe = (rel.assets || []).filter(function (a) { return /\.exe$/i.test(a.name); })[0];
      Array.prototype.forEach.call(document.querySelectorAll('[data-download]'), function (a) {
        if (exe) a.setAttribute('href', exe.browser_download_url);
      });
      Array.prototype.forEach.call(document.querySelectorAll('[data-version]'), function (el) { el.textContent = rel.tag_name; });
      Array.prototype.forEach.call(document.querySelectorAll('[data-size]'), function (el) {
        if (exe) el.textContent = (exe.size / 1048576).toFixed(0) + ' MB';
      });
    })
    .catch(function () { /* keep the static text */ });
})();
