'use strict';

// Checks the public-release material: license files, documents, links between them, the website and its workflows.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const exists = (f) => fs.existsSync(path.join(root, f));
const pkg = JSON.parse(read('package.json'));

const MARKDOWN = [
  'README.md', 'README.ar.md', 'PRIVACY.md', 'SECURITY.md', 'CONTRIBUTING.md', 'CODE_OF_CONDUCT.md', 'NOTICE.md', 'THIRD_PARTY_NOTICES.md',
  'docs/USER_GUIDE.md', 'docs/USER_GUIDE.ar.md', 'docs/WINDOWS_WARNING.md', 'docs/WINDOWS_WARNING.ar.md',
  'docs/CODE_SIGNING_POLICY.md', 'docs/PUBLISHING.md', 'docs/DEVELOPMENT.md', 'docs/CHANGELOG.md', 'docs/DATA_FORMAT.md',
];

test('license: GPL-3.0-or-later everywhere it is stated', () => {
  assert.equal(pkg.license, 'GPL-3.0-or-later');
  assert.match(read('LICENSE'), /GNU GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/);
  assert.ok(pkg.build.files.includes('LICENSE') && pkg.build.files.includes('THIRD_PARTY_NOTICES.md'), 'the license ships inside the installer');
  assert.match(read('NOTICE.md'), /GPL|General Public License/);
  assert.match(read('README.md'), /GNU General Public License/);
  assert.match(read('THIRD_PARTY_NOTICES.md'), /GeoNames/);
});

test('every public document exists and no private e-mail address is in the repository docs', () => {
  for (const f of MARKDOWN) assert.ok(exists(f), `${f} exists`);
  for (const f of MARKDOWN) assert.ok(!/@corneredge/i.test(read(f)), `${f} has no private address`);
  for (const f of ['.github/ISSUE_TEMPLATE/bug_report.yml', '.github/ISSUE_TEMPLATE/feature_request.yml', '.github/ISSUE_TEMPLATE/config.yml']) assert.ok(exists(f), f);
});

function slug(text) {
  return text.trim().toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}_\s-]/gu, '').replace(/\s/g, '-');
}

test('links between documents point at files and headings that exist', () => {
  for (const f of MARKDOWN) {
    const text = read(f);
    const headings = new Set([...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => slug(m[1])));
    for (const m of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const href = m[1];
      if (/^(https?:|mailto:)/.test(href)) continue;
      const [target, frag] = href.split('#');
      if (target.startsWith('../../')) continue; // GitHub pages such as ../../releases/latest
      if (!target) {
        if (frag) assert.ok(headings.has(frag), `${f}: heading #${frag} exists`);
        continue;
      }
      const resolved = path.join(path.dirname(f), target);
      assert.ok(exists(resolved), `${f}: ${href} points at an existing file`);
      if (frag && resolved.endsWith('.md')) {
        const other = new Set([...read(resolved).matchAll(/^#{1,6}\s+(.+)$/gm)].map((x) => slug(x[1])));
        assert.ok(other.has(frag), `${f}: ${href} points at an existing heading`);
      }
    }
  }
});

test('both guides cover every Settings section and every Statistics chart', () => {
  const { STATS_CHARTS } = require('../src/core/settings');
  const en = read('docs/USER_GUIDE.md');
  for (const section of ['Language', 'Prayer Times', 'Reminders & Notifications', 'Application', 'Daily View', 'Full-screen reminder', 'Sounds', 'Categories', 'Data']) {
    assert.ok(en.includes(`**${section}**`), `the English guide describes the "${section}" section`);
  }
  for (const chart of STATS_CHARTS) assert.ok(en.includes(chart.title), `the English guide lists the chart "${chart.title}"`);
  const AR = require('../src/core/i18n-ar');
  const ar = read('docs/USER_GUIDE.ar.md');
  for (const chart of STATS_CHARTS) {
    const word = AR[chart.title];
    assert.ok(word, `${chart.title} has an Arabic title`);
    assert.ok(ar.includes(word), `the Arabic guide lists the chart "${word}"`);
  }
  // both guides have the same chapters
  const count = (t) => (t.match(/^## /gm) || []).length;
  assert.equal(count(en), count(ar));
});

test('every screenshot used by the documents and the website exists', () => {
  const files = [...MARKDOWN, 'site/index.html', 'site/ar.html'];
  for (const f of files) {
    for (const m of read(f).matchAll(/(?:src|\()="?((?:\.\.\/)*(?:docs\/)?images\/[^")\s]+|assets\/screens\/[^")\s]+)/g)) {
      const rel = m[1];
      const base = f.startsWith('site/') ? 'site' : path.dirname(f);
      assert.ok(exists(path.join(base, rel)), `${f} uses ${rel}`);
    }
  }
  for (const f of fs.readdirSync(path.join(root, 'docs/images'))) {
    if (f.endsWith('.webp')) assert.ok(exists(`site/assets/screens/${f}`), `the website has ${f}`);
  }
  assert.ok(exists('docs/images/social-preview.png'));
});

test('website: pages, security policy, no third-party content, links resolve', () => {
  for (const f of ['index.html', 'ar.html', 'guide.html', 'guide-ar.html', 'windows-warning.html', 'windows-warning-ar.html', 'privacy.html', 'code-signing.html', 'security.html', 'licenses.html', 'notice.html', 'style.css', 'app.js', 'config.js', 'favicon.ico']) {
    assert.ok(exists(`site/${f}`), `site/${f} exists`);
  }
  for (const f of fs.readdirSync(path.join(root, 'site')).filter((x) => x.endsWith('.html'))) {
    const html = read(`site/${f}`);
    assert.match(html, /Content-Security-Policy/, `${f} has a security policy`);
    assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), `${f} has no inline script`);
    assert.ok(!/\sstyle="/i.test(html), `${f} has no inline style`);
    assert.ok(!/(?:src|href)="https?:\/\/[^"]*\.(?:js|css|woff2?|png|jpe?g)"/i.test(html), `${f} loads nothing from other sites`);
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    for (const m of html.matchAll(/href="([^"#:]*)(?:#([^"]*))?"/g)) {
      const [, file, frag] = m;
      if (file && !/^https?/.test(file)) assert.ok(exists(`site/${file}`), `${f}: ${file} exists`);
      if (!file && frag && !frag.startsWith('repo')) assert.ok(ids.has(frag), `${f}: #${frag} exists`);
    }
  }
  const index = read('site/index.html');
  assert.ok(index.includes('Windows protected your PC') && index.includes('id="code-signing"'));
  assert.ok(read('site/app.js').includes('api.github.com'));
});

test('the guide pages of the website are up to date with the Markdown (run: python3 tools/build-site.py)', () => {
  const guide = read('site/guide.html');
  const h2 = [...read('docs/USER_GUIDE.md').matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  for (const title of h2) assert.ok(guide.includes(title.replace(/&/g, '&amp;')), `site/guide.html has "${title}"`);
  assert.ok(!exists('site/changelog.html'), 'the website has no release notes page (they stay in the repository)');
  for (const f of ['index.html', 'ar.html']) assert.ok(!/release notes|what's new|الجديد/i.test(read(`site/${f}`)), `${f} has no release notes`);
});

test('workflows: release is manual and safe, the others may run on push', () => {
  const pages = read('.github/workflows/pages.yml');
  const release = read('.github/workflows/release.yml');
  assert.match(release, /on:\s*\n\s+workflow_dispatch/, 'the release is started by hand only');
  assert.ok(!/^\s+(push|pull_request|schedule):/m.test(release), 'a release never starts by itself');
  for (const f of ['build', 'lockfile']) {
    const w = read(`.github/workflows/${f}.yml`);
    assert.ok(!/^\s+(push|pull_request|schedule):/m.test(w), `${f} stays manual`);
  }
  for (const f of ['test', 'ui-check', 'pages']) {
    const w = read(`.github/workflows/${f}.yml`);
    assert.match(w, /^\s+push:/m, `${f} runs on push`);
    assert.match(w, /workflow_dispatch/, `${f} can still be started by hand`);
  }
  assert.ok(pages.includes('path: site') && pages.includes('deploy-pages'));
  assert.ok(release.includes('--draft'), 'a release is created as a draft first');
  assert.ok(release.includes('SHA256SUMS.txt') && release.includes('npm ci'));
  assert.ok(release.includes('package.json'), 'the version is checked against package.json');
});

test('privacy statement matches what the app does: no network use in the app code', () => {
  const hits = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (/\.(js|html)$/.test(e.name) && !/world-cities/.test(e.name)) {
        if (/\bfetch\(|XMLHttpRequest|net\.request|require\('https?'\)|autoUpdater/.test(read(p))) hits.push(p);
      }
    }
  };
  walk('src');
  assert.deepEqual(hits, [], 'the app code makes no network requests');
});
