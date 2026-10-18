#!/usr/bin/env python3
"""Build the guide pages of the website (site/*.html) from the Markdown documents.

The Markdown files in the repository stay the single source. Run:  python3 tools/build-site.py
Needs the Python package "markdown" (pip install markdown). site/index.html and site/ar.html are written by hand.
"""
import re, html, sys
from pathlib import Path
import markdown

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / 'site'

# source -> (output, language, title)
PAGES = {
    'docs/USER_GUIDE.md': ('guide.html', 'en', 'User guide'),
    'docs/USER_GUIDE.ar.md': ('guide-ar.html', 'ar', 'دليل المستخدم'),
    'docs/WINDOWS_WARNING.md': ('windows-warning.html', 'en', 'Windows warning'),
    'docs/WINDOWS_WARNING.ar.md': ('windows-warning-ar.html', 'ar', 'تحذير ويندوز'),
    'PRIVACY.md': ('privacy.html', 'en', 'Privacy'),
    'SECURITY.md': ('security.html', 'en', 'Security'),
    'docs/CODE_SIGNING_POLICY.md': ('code-signing.html', 'en', 'Code signing policy'),
    'NOTICE.md': ('notice.html', 'en', 'License notice'),
    'THIRD_PARTY_NOTICES.md': ('licenses.html', 'en', 'Third-party licenses'),
}
BY_SOURCE = {Path(k).name: v[0] for k, v in PAGES.items()}
BY_SOURCE['README.md'] = 'index.html'
BY_SOURCE['README.ar.md'] = 'ar.html'


def slug(text):
    """Same rule as GitHub: lower case, drop punctuation, spaces become hyphens."""
    text = re.sub(r'<[^>]+>', '', text).strip().lower()
    text = re.sub(r'[^\w\s-]', '', text)
    return re.sub(r'\s', '-', text)


def fix_link(href, src):
    if re.match(r'^(https?:|mailto:|#)', href):
        return href
    path, _, frag = href.partition('#')
    frag = '#' + frag if frag else ''
    if not path:
        return href
    # the link is relative to the Markdown file; work out where it points inside the repository
    parts = []
    for piece in list((Path(src).parent / path).parts):
        if piece == '..':
            if parts and parts[-1] != '..':
                parts.pop()
            else:
                parts.append('..')  # above the repository root: a GitHub page such as ../../releases
        elif piece != '.':
            parts.append(piece)
    rel = '/'.join(parts)
    if rel in PAGES:
        return PAGES[rel][0] + frag
    if rel in ('README.md', 'README.ar.md'):
        return BY_SOURCE[rel] + frag
    if rel.startswith('docs/images/'):
        return 'assets/screens/' + rel[len('docs/images/'):] + frag
    if rel.startswith('..'):
        rest = re.sub(r'^(\.\./)+', '', rel)
        return '#repo:' + rest + frag
    return '#repo:blob/main/' + rel + frag


def convert(src, out, lang, title):
    text = (ROOT / src).read_text(encoding='utf-8')
    text = re.sub(r'^</?div[^>]*>\s*$', '', text, flags=re.M)
    md = markdown.Markdown(extensions=['tables', 'fenced_code', 'toc', 'sane_lists'],
                           extension_configs={'toc': {'slugify': lambda v, s: slug(v)}})
    body = md.convert(text)
    body = re.sub(r'href="([^"]+)"', lambda m: 'href="%s"' % fix_link(html.unescape(m.group(1)), src).replace('&', '&amp;'), body)
    body = re.sub(r'src="images/([^"]+)"', r'src="assets/screens/\1" loading="lazy"', body)
    rtl = lang == 'ar'
    home, other = ('ar.html', 'index.html') if rtl else ('index.html', 'ar.html')
    nav = (('المزايا', 'التثبيت', 'دليل المستخدم', 'English') if rtl else ('Features', 'Install', 'User guide', 'العربية'))
    guide = 'guide-ar.html' if rtl else 'guide.html'
    page = f'''<!doctype html>
<html lang="{lang}" dir="{'rtl' if rtl else 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src https://api.github.com; base-uri 'self'; form-action 'none'">
<title>{html.escape(title)} - WaqtWise</title>
<link rel="icon" href="favicon.ico">
<link rel="stylesheet" href="style.css">
</head>
<body>
<header class="site-header"><div class="wrap">
  <a class="brand" href="{home}"><img src="assets/logo.png" alt="">WaqtWise</a>
  <nav class="nav">
    <a href="{home}#features">{nav[0]}</a><a href="{home}#install">{nav[1]}</a><a href="{guide}">{nav[2]}</a>
    <a class="lang" href="{other}">{nav[3]}</a>
  </nav>
</div></header>
<main class="wrap"><article class="doc">
{body}
</article></main>
<script src="config.js"></script>
<script src="app.js"></script>
</body></html>
'''
    (SITE / out).write_text(page, encoding='utf-8')
    print('wrote', out)


if __name__ == '__main__':
    for src, (out, lang, title) in PAGES.items():
        convert(src, out, lang, title)
