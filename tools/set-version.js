'use strict';

// One command keeps the version the same everywhere:  node tools/set-version.js 1.2.0
// It changes package.json, package-lock.json, the example versions in the guides and templates, and adds an
// empty section to docs/CHANGELOG.md when there is none. tests/version.test.js fails if anything disagrees.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const next = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(next || '')) {
  console.error('Usage: node tools/set-version.js MAJOR.MINOR.PATCH   (for example 1.2.0)');
  process.exit(1);
}
const file = (p) => path.join(root, p);
const read = (p) => fs.readFileSync(file(p), 'utf8');
const write = (p, text) => fs.writeFileSync(file(p), text);

// package.json and the lock file: only the version lines change (the rest of the file is left exactly as it is).
// In the lock file these are the first two "version" lines: the project itself and the root package.
write('package.json', read('package.json').replace(/("version":\s*")\d+\.\d+\.\d+(")/, `$1${next}$2`));
let lockText = read('package-lock.json');
let seen = 0;
lockText = lockText.replace(/("version":\s*")\d+\.\d+\.\d+(")/g, (m, a, b) => (++seen <= 2 ? `${a}${next}${b}` : m));
write('package-lock.json', lockText);

// Places that name the version in text (the installer file name, the example in the bug template and the release form)
const replacements = [
  ['docs/WINDOWS_WARNING.md', /WaqtWise-Setup-\d+\.\d+\.\d+\.exe/g, `WaqtWise-Setup-${next}.exe`],
  ['docs/WINDOWS_WARNING.ar.md', /WaqtWise-Setup-\d+\.\d+\.\d+\.exe/g, `WaqtWise-Setup-${next}.exe`],
  ['.github/ISSUE_TEMPLATE/bug_report.yml', /placeholder: "\d+\.\d+\.\d+"/, `placeholder: "${next}"`],
  ['.github/workflows/release.yml', /\(for example \d+\.\d+\.\d+\)/, `(for example ${next})`],
  ['site/index.html', /(<span data-version>)\d+\.\d+\.\d+/g, `$1${next}`],
  ['site/ar.html', /(<span data-version>)\d+\.\d+\.\d+/g, `$1${next}`],
  ['docs/PUBLISHING.md', /\(e\.g\. `\d+\.\d+\.\d+`\)/, `(e.g. \`${next}\`)`],
];
for (const [p, pattern, value] of replacements) {
  if (fs.existsSync(file(p))) write(p, read(p).replace(pattern, value));
}

// A section in the change log
let log = read('docs/CHANGELOG.md');
if (!new RegExp(`^## ${next.replace(/\./g, '\\.')}\\s*$`, 'm').test(log)) {
  log = log.replace(/^## /m, `## ${next}\n\nNew\n- \n\n## `);
  write('docs/CHANGELOG.md', log);
}
console.log(`Version is now ${next}. Run: node --test tests/version.test.js`);
