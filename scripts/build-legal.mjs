/**
 * Writes the hostable privacy policy and terms from the app's own copy.
 *
 * App Store Connect and the Play Console both demand a publicly reachable
 * privacy-policy URL, and a subscription app has to link its terms from
 * the paywall. Those documents already exist — as the /privacy and /terms
 * screens — and the one thing that must never happen is the hosted pages
 * saying something different from the app.
 *
 * So they are generated from the same source rather than written twice.
 * Edit the screens; run `node scripts/build-legal.mjs`; the pages follow.
 *
 * Usage:  node scripts/build-legal.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src', 'app');
const OUT = join(process.cwd(), 'legal');

/** Pulls the SECTIONS array out of a screen without importing native code. */
function sections(file) {
  const text = readFileSync(join(SRC, file), 'utf8');
  const block = text.match(/const SECTIONS[\s\S]*?\n\];/);
  if (!block) throw new Error(`No SECTIONS in ${file}`);

  const out = [];
  const entry = /title:\s*'((?:[^'\\]|\\.)*)',\s*\n\s*body:\s*'((?:[^'\\]|\\.)*)',/g;
  let m;
  while ((m = entry.exec(block[0]))) {
    out.push({ title: unescape(m[1]), body: unescape(m[2]) });
  }
  if (out.length === 0) throw new Error(`No sections parsed from ${file}`);
  return out;
}

const unescape = (s) => s.replace(/\\'/g, "'").replace(/\\\\/g, '\\');
const escape = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const UPDATED = new Date().toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function page({ title, intro, items, footer }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · Tress</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0 auto; padding: 3rem 1.25rem 5rem; max-width: 38rem;
    font: 17px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #16171a; background: #f0eee9;
  }
  h1 { font-size: 1.9rem; line-height: 1.2; margin: 0 0 .25rem; letter-spacing: -.02em; }
  .brand { font-size: .78rem; letter-spacing: .16em; text-transform: uppercase; color: #6c7360; margin: 0 0 1.75rem; }
  .updated { color: #7a7d78; font-size: .9rem; margin: 0 0 2.5rem; }
  h2 { font-size: 1.05rem; margin: 2.25rem 0 .4rem; }
  p { margin: 0; }
  footer { margin-top: 3.5rem; padding-top: 1.25rem; border-top: 1px solid rgba(22,23,26,.1); color: #7a7d78; font-size: .9rem; }
  @media (prefers-color-scheme: dark) {
    body { color: #ece9e3; background: #16171a; }
    .brand { color: #9aa58f; }
    .updated, footer { color: #8e8f8b; }
    footer { border-top-color: rgba(255,255,255,.12); }
  }
</style>
</head>
<body>
  <p class="brand">Tress</p>
  <h1>${escape(title)}</h1>
  <p class="updated">Last updated ${UPDATED}</p>
  ${intro ? `<p>${escape(intro)}</p>` : ''}
${items.map((s) => `  <h2>${escape(s.title)}</h2>\n  <p>${escape(s.body)}</p>`).join('\n')}
  <footer>${escape(footer)}</footer>
</body>
</html>
`;
}

const privacy = page({
  title: 'Privacy Policy',
  intro:
    'Tress keeps your photographs and everything else you record on your own device. This policy describes what that means in practice.',
  items: sections('privacy.tsx'),
  footer:
    'Tress is a tracking and documentation tool. It is not a medical device and does not provide medical advice.',
});

const terms = page({
  title: 'Terms of Use',
  intro: null,
  items: sections('terms.tsx'),
  footer:
    'Tress is a tracking and documentation tool. It is not a medical device and does not provide medical advice.',
});

writeFileSync(join(OUT, 'privacy.html'), privacy);
writeFileSync(join(OUT, 'terms.html'), terms);
console.log('legal/privacy.html', `${sections('privacy.tsx').length} sections`);
console.log('legal/terms.html  ', `${sections('terms.tsx').length} sections`);
