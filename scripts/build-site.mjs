/**
 * Writes the public website: landing page, support, privacy and terms.
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
 * The two legal pages are generated from the app's own /privacy and
 * /terms screens rather than written twice, because the one thing that
 * must never happen is the hosted page saying something the app does not.
 *
 * Usage:  node scripts/build-legal.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The address on the support page and in the store listings.
 *
 * Deliberately not a personal inbox: it goes on a public App Store
 * product page and it will be scraped. Replace it once the domain
 * exists — a forwarding alias is fine, it does not need its own mailbox.
 */
const SUPPORT_EMAIL = 'support@example.com';

const SRC = join(process.cwd(), 'src', 'app');
const OUT = join(process.cwd(), 'site');

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

/**
 * One stylesheet for every page.
 *
 * The app's own colours: the ivory it opens on, the sage it accents
 * with, the serif the membership card is set in. Nothing is loaded from
 * anywhere — no fonts, no scripts, no analytics — because the privacy
 * policy says this app has no trackers and a site that quietly loads
 * three would make a liar of it.
 */
const CSS = `
  :root { color-scheme: light dark; --ink:#16171a; --paper:#f0eee9; --sage:#6c7360; --quiet:#7a7d78; --line:rgba(22,23,26,.1); }
  @media (prefers-color-scheme: dark) {
    :root { --ink:#ece9e3; --paper:#16171a; --sage:#9aa58f; --quiet:#8e8f8b; --line:rgba(255,255,255,.12); }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto; padding: 3rem 1.25rem 5rem; max-width: 38rem;
    font: 17px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: var(--ink); background: var(--paper);
  }
  a { color: var(--sage); }
  h1 { font-size: 1.9rem; line-height: 1.2; margin: 0 0 .25rem; letter-spacing: -.02em; }
  .brand { font-size: .78rem; letter-spacing: .16em; text-transform: uppercase; color: var(--sage); margin: 0 0 1.75rem; }
  .brand a { color: inherit; text-decoration: none; }
  .updated { color: var(--quiet); font-size: .9rem; margin: 0 0 2.5rem; }
  h2 { font-size: 1.05rem; margin: 2.25rem 0 .4rem; }
  p { margin: 0 0 1rem; }
  footer { margin-top: 3.5rem; padding-top: 1.25rem; border-top: 1px solid var(--line); color: var(--quiet); font-size: .9rem; }
  footer a { margin-right: 1rem; }
  .lede { font-size: 1.15rem; }
  .serif { font-family: Palatino, "Palatino Linotype", Georgia, serif; font-style: italic; color: var(--sage); }
  ul { padding-left: 1.1rem; }
  li { margin-bottom: .5rem; }
`;

const NAV = `<footer>
  <a href="/">Home</a><a href="/support.html">Support</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a>
</footer>`;

function shell({ title, body, updated }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · Tress</title>
<meta name="description" content="Tress is a haircare journal. Photograph your hair from the same angles over time, keep notes beside the photos, and track what you use. Everything stays on your device.">
<style>${CSS}</style>
</head>
<body>
  <p class="brand"><a href="/">Tress</a></p>
${body}
  ${NAV}
</body>
</html>
`;
}

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

/* ------------------------------ landing ------------------------------- */

/**
 * What the site is allowed to claim.
 *
 * The same rule as the app: Tress records, it does not treat. No
 * before-and-after photographs, no outcome figures, no testimonials.
 * Anybody arriving here from a store listing should recognise the
 * product they were just reading about.
 */
const home = shell({
  title: 'Tress — Haircare Journal',
  body: `  <h1>Your hair, month by month.</h1>
  <p class="lede">Tress is a haircare journal. Photograph your hair from the same
  five angles over time, write a line beside each set, and keep track of what you
  are actually using.</p>

  <p class="serif">Better Hair. A Confident You.</p>

  <h2>What it does</h2>
  <ul>
    <li><strong>Five angles, framed the same way.</strong> Guides line each shot up
    with the last, so what you compare next month is your hair rather than where you
    happened to stand.</li>
    <li><strong>Any two months, side by side.</strong> Change spread over months is
    invisible day to day and obvious across a slider.</li>
    <li><strong>A line beside every set.</strong> What you changed, how the month
    went. The part you will not remember in March.</li>
    <li><strong>Your stack, ticked not planned.</strong> Whatever you already use,
    in one list, with the days you actually did it.</li>
  </ul>

  <h2>Your photographs stay yours</h2>
  <p>There is no account, no sign-in and no server. Your photographs, notes and
  routine are stored in the app&rsquo;s private storage on your own device. They are
  not uploaded, not analysed, and not shared with anyone. We could not see them if
  we wanted to, because they never reach us.</p>

  <h2>What it is not</h2>
  <p>Tress is a tracking and documentation tool. It is not a medical device, it does
  not diagnose anything, and nothing in it is medical advice. It records change; it
  does not cause it. For anything clinical, speak to a qualified healthcare
  professional.</p>

  <h2>Coming to the App Store</h2>
  <p>Tress is in preparation for release. If you have a question in the meantime,
  the <a href="/support.html">support page</a> has the address.</p>`,
});

/* ------------------------------ support ------------------------------- */

const support = shell({
  title: 'Support',
  body: `  <h1>Support</h1>
  <p class="updated">Last updated ${UPDATED}</p>

  <p>Email <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> and a person will
  read it. Tell us what device you are on and what happened, and if a screen looks
  wrong, a screenshot saves a lot of back and forth.</p>

  <h2>Where is my data?</h2>
  <p>On your device, and only there. Tress has no account and no server, so there is
  nothing for us to look up on your behalf &mdash; and nothing for anyone else to
  breach. See the <a href="/privacy.html">privacy policy</a>.</p>

  <h2>I have changed phone</h2>
  <p>Your journey is included in your device backup if you have one turned on, so
  restoring that phone from backup brings it across. There is no cloud copy for us
  to restore from.</p>

  <h2>How do I delete everything?</h2>
  <p>Settings &rarr; <em>Delete all my data</em> removes every photograph, entry and
  setting from the device permanently. Deleting the app does the same.</p>

  <h2>Managing your subscription</h2>
  <p>Subscriptions are billed by Apple or Google, not by us, and are managed in your
  App Store or Google Play account settings. Cancelling stops the next renewal;
  access continues until the period you have paid for ends. Refunds are granted by
  the store you bought from, under that store&rsquo;s policy.</p>

  <h2>Is Tress medical advice?</h2>
  <p>No. It is a tracking and documentation tool. It does not diagnose conditions,
  recommend treatments or provide medical advice. Always consult a qualified
  healthcare professional.</p>`,
});

writeFileSync(join(OUT, 'index.html'), home);
writeFileSync(join(OUT, 'support.html'), support);
writeFileSync(join(OUT, 'privacy.html'), privacy);
writeFileSync(join(OUT, 'terms.html'), terms);

for (const f of ['index.html', 'support.html', 'privacy.html', 'terms.html']) {
  console.log(`site/${f}`);
}
if (SUPPORT_EMAIL.includes('example')) {
  console.log('\n\u26a0  SUPPORT_EMAIL is still a placeholder. Set it before publishing.');
}
