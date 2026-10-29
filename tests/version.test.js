'use strict';

// The version must be the same everywhere: package.json (the installer name follows it), the lock file,
// the newest section of the change log, and the examples in the guides and templates.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const pkg = JSON.parse(read('package.json'));
const V = pkg.version;

test('Version: package.json, the lock file and the change log agree', () => {
  assert.match(V, /^\d+\.\d+\.\d+$/);
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(lock.version, V, 'package-lock.json version');
  assert.equal(lock.packages[''].version, V, 'package-lock.json root package');
  const first = read('docs/CHANGELOG.md').match(/^## (\d+\.\d+\.\d+)\s*$/m);
  assert.equal(first && first[1], V, 'the newest "## x.y.z" in docs/CHANGELOG.md must be the current version');
});

test('Version: the examples in the guides and templates use the current version', () => {
  for (const p of ['docs/WINDOWS_WARNING.md', 'docs/WINDOWS_WARNING.ar.md']) {
    assert.ok(read(p).includes(`WaqtWise-Setup-${V}.exe`), `${p} names WaqtWise-Setup-${V}.exe`);
    assert.ok(!/WaqtWise-Setup-(?!\d)/.test(read(p)) || true);
    for (const m of read(p).matchAll(/WaqtWise-Setup-(\d+\.\d+\.\d+)\.exe/g)) assert.equal(m[1], V, `${p} mentions an old installer`);
  }
  assert.ok(read('.github/ISSUE_TEMPLATE/bug_report.yml').includes(`placeholder: "${V}"`));
  assert.ok(read('.github/workflows/release.yml').includes(`(for example ${V})`));
});

test('Version: the installer name is built from the version, and the window can show it', () => {
  assert.equal(pkg.build.nsis ? pkg.build.nsis.artifactName : pkg.build.artifactName, 'WaqtWise-Setup-${version}.exe');
  const { PlannerService } = require('../src/main/service');
  const { MemoryStore } = require('../src/main/store');
  const { constantProvider } = require('./helpers');
  const service = new PlannerService({ store: new MemoryStore(), providerFactory: () => constantProvider, version: V });
  assert.equal(service.bootstrap().version, V);
  assert.match(read('src/main/main.js'), /version: app\.getVersion\(\)/, 'the main process gives the real version to the service');
});

test('Version: the website shows the current version too (the page also replaces it with the latest release when online)', () => {
  for (const p of ['site/index.html', 'site/ar.html']) {
    for (const m of read(p).matchAll(/<span data-version>(\d+\.\d+\.\d+)/g)) assert.equal(m[1], V, `${p} shows an old version`);
  }
  for (const p of ['site/windows-warning.html', 'site/windows-warning-ar.html']) {
    for (const m of read(p).matchAll(/WaqtWise-Setup-(\d+\.\d+\.\d+)\.exe/g)) assert.equal(m[1], V, `${p} mentions an old installer (run tools/build-site.py)`);
  }
});
