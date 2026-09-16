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
 * Edit the screens; run `node scripts/build-site.mjs`; the pages follow.
 * netlify.toml runs the same command on every push, so whatever is
 * deployed is what the screens said at that commit.
 *
 * The landing and support pages have no screen behind them — their copy
 * is written below, in this file. That is why they escaped two rounds of
 * corrections to the policy and went on claiming things the app had
 * stopped doing. Anything asserted here about what the app does is a
 * claim in the same sense as a line of the privacy policy, and is held to
 * the same standard: if the code cannot prove it, do not write it.
 *
 * Dates are per page and come from each page's own source; see "the
 * dates" below.
 *
 * Usage:  node scripts/build-site.mjs
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The address on the support page and in the store listings.
 *
 * Deliberately not a personal inbox: it goes on a public App Store
 * product page and it will be scraped. A forwarding alias on the domain
 * is enough — it does not need a mailbox of its own.
 */
const SUPPORT_EMAIL = 'support@tresshaircare.com';

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

/* ---------------------------- the dates ------------------------------- */

/**
 * When each page last changed — not when it was last built.
 *
 * This used to be one `new Date()` stamped on every page at build time.
 * netlify.toml runs this script on every push, so that would have moved
 * the date on all four documents for any commit at all, and a policy
 * whose date moves when its text did not is a policy nobody can tell has
 * changed. Worse, it would move them on the hosted copy while the app's
 * own screens kept the right date.
 *
 * So each page takes its date from its own source:
 *
 *   privacy.html, terms.html  the hand-set LAST_UPDATED in the screen the
 *                             page is generated from. That is the same
 *                             constant the app shows, so the two copies of
 *                             the document cannot disagree about their date.
 *   support.html              the last commit that touched this file, which
 *                             is where the support copy is written.
 *   index.html                no date line at all — it is a landing page.
 *
 * Git is asked, never required. `git()` returns null for every kind of
 * failure — no git binary, no repository, a source export with no history —
 * and the caller falls through to today's date. A file with uncommitted
 * changes also falls through to today, because its commit date is then
 * older than its text. Nothing here can fail the build.
 */

const TODAY = new Date().toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** Runs git read-only. Returns its trimmed output, or null if git cannot answer. */
function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

/** '2026-09-16' -> '16 September 2026'. Null for anything that is not a date. */
function longDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * The date of the last commit that touched one file, or null if git cannot
 * say or if the file has been edited since that commit.
 */
function committedDate(path) {
  const status = git(['status', '--porcelain', '--', path]);
  if (status === null || status !== '') return null;
  const iso = git(['log', '-1', '--format=%cs', '--', path]);
  return iso ? longDate(iso) : null;
}

/** The hand-set LAST_UPDATED in a screen, if it has one. */
function declaredDate(file) {
  const m = readFileSync(join(SRC, file), 'utf8').match(/const LAST_UPDATED = '([^']+)'/);
  return m ? m[1] : null;
}

/**
 * A note in the build log — never an error — when a screen was committed
 * after the date it declares: somebody moved the text and left the date.
 * Skipped on a shallow clone, where the only commit date available is the
 * deploy's own and the comparison would be meaningless.
 */
function warnIfStale(file, declared) {
  if (!declared) return;
  if (git(['rev-parse', '--is-shallow-repository']) !== 'false') return;
  const iso = git(['log', '-1', '--format=%cs', '--', join('src', 'app', file)]);
  if (!iso) return;
  const committed = Date.parse(`${iso}T00:00:00`);
  const written = Date.parse(declared);
  if (Number.isNaN(committed) || Number.isNaN(written)) return;
  if (committed > written) {
    console.log(
      `\u26a0  src/app/${file} was committed on ${longDate(iso)} but declares ` +
        `"${declared}". Move LAST_UPDATED if the text changed.`,
    );
  }
}

/** The date one screen's page carries, and a note in the log if it looks stale. */
function updatedFor(file) {
  const declared = declaredDate(file);
  warnIfStale(file, declared);
  return declared ?? committedDate(join('src', 'app', file)) ?? TODAY;
}

const PRIVACY_UPDATED = updatedFor('privacy.tsx');
const TERMS_UPDATED = updatedFor('terms.tsx');
const SUPPORT_UPDATED = committedDate(join('scripts', 'build-site.mjs')) ?? TODAY;

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

  /* Landing page only. */
  .hero { text-align: center; padding: 1rem 0 2.5rem; }
  .emblem {
    width: 108px; height: 108px; margin: 0 auto 1.25rem; display: block;
    border-radius: 26px; object-fit: cover; background: #f4f2ef;
    box-shadow: 0 10px 30px rgba(22,23,26,.10);
  }
  .wordmark { font-size: 2.6rem; line-height: 1; margin: 0 0 .5rem; letter-spacing: -.03em; }
  .tagline { font-family: Palatino, "Palatino Linotype", Georgia, serif; font-style: italic;
             color: var(--sage); font-size: 1.15rem; margin: 0; }
  .hero .lede { margin: 1.5rem auto 0; max-width: 30rem; }
  .cards { display: grid; gap: .75rem; margin: 1rem 0 0; padding: 0; list-style: none; }
  .cards li {
    margin: 0; padding: 1rem 1.15rem; border: 1px solid var(--line); border-radius: 14px;
  }
  .cards b { display: block; margin-bottom: .2rem; }
  .cards span { color: var(--quiet); font-size: .95rem; }
  .note {
    border-left: 3px solid var(--sage); padding: .1rem 0 .1rem 1rem; margin: 1rem 0;
  }
  @media (min-width: 34rem) { .cards { grid-template-columns: 1fr 1fr; } }
`;

const NAV = `<footer>
  <a href="/">Home</a><a href="/support.html">Support</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a>
</footer>`;

function shell({ title, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} · Tress</title>
<meta name="description" content="Tress is a haircare journal. Photograph your hair from the same angles over time, keep notes beside the photos, and track what you use. Your photographs stay on your device.">
<meta name="google-site-verification" content="FuAsE26ui9Salq2xd-daBHT_fqomWNRGpcV-im-ErSM">
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

function page({ title, intro, items, footer, updated }) {
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
  <p class="updated">Last updated ${escape(updated)}</p>
  ${intro ? `<p>${escape(intro)}</p>` : ''}
${items.map((s) => `  <h2>${escape(s.title)}</h2>\n  <p>${escape(s.body)}</p>`).join('\n')}
  <footer>${escape(footer)}</footer>
</body>
</html>
`;
}

const privacy = page({
  title: 'Privacy Policy',
  updated: PRIVACY_UPDATED,
  intro:
    'Tress keeps your photographs and everything else you record on this device. This is what that means in practice, including the few things that do leave.',
  items: sections('privacy.tsx'),
  footer:
    'Tress is a tracking and documentation tool. It is not a medical device and does not provide medical advice.',
});

const terms = page({
  title: 'Terms of Use',
  updated: TERMS_UPDATED,
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
  body: `  <div class="hero">
    <img class="emblem" src="/emblem.png" alt="">
    <h1 class="wordmark">Tress</h1>
    <p class="tagline">Better Hair. A Confident You.</p>
    <p class="lede">A haircare journal. Photograph your hair from the same five angles
    over time, write a line beside each set, and keep track of what you are actually
    using.</p>
  </div>

  <h2>What it does</h2>
  <ul class="cards">
    <li><b>Five angles, framed the same way</b><span>Guides line each shot up with the
    last, so what you compare next month is your hair rather than where you happened
    to stand.</span></li>
    <li><b>Any two months, side by side</b><span>Change spread over months is invisible
    day to day and obvious across a slider.</span></li>
    <li><b>A line beside every set</b><span>What you changed, how the month went. The
    part you will not remember in March.</span></li>
    <li><b>Your stack, ticked not planned</b><span>Whatever you already use, in one
    list, with the days you actually did it.</span></li>
  </ul>

  <h2>Your photographs stay yours</h2>
  <div class="note">
    <p>There is no account, no sign-in and no server of ours. Your photographs, notes
    and routine live in the app&rsquo;s private storage on your own phone. No part of
    the app uploads them, so your photographs are not ours to see.</p>
    <p>They are read on the phone, by the phone. The models that read a picture ship
    inside the app &mdash; one helps line the shot up, another measures how much of the
    frame your hair covers. The picture goes in, a few numbers come back, and the
    picture stays where it is.</p>
    <p>Some things do leave, and the <a href="/privacy.html">privacy policy</a> takes
    them one at a time: when you scan a product, its barcode digits go to Open Beauty
    Facts and its picture comes back; on iPhone, opening the subscription screen &mdash;
    the paywall &mdash; asks our subscription provider about this install, as do buying
    and restoring, and once there is a membership to keep track of the app asks again
    when the answer it has stored has run out of date; anything you send from the share
    sheet goes where you send it, and an update sheet has your photographs in it; and a
    device backup, if you have one turned on, carries the photograph files off the
    phone.</p>
    <p style="margin:0">No photograph and nothing you write is part of the barcode
    lookup or the subscription check. And if you never open the subscription screen and
    never buy, that check does not happen: an install that has not been near the price
    is not one our subscription provider has heard of.</p>
  </div>

  <h2>What it is not</h2>
  <p>Tress is a tracking and documentation tool. It is not a medical device, it does
  not diagnose anything, and nothing in it is medical advice. It records change; it
  does not cause it. For anything clinical, speak to a qualified healthcare
  professional.</p>

  <h2>Coming to the App Store</h2>
  <p>Tress is in preparation for release. Questions in the meantime go to the
  <a href="/support.html">support page</a>.</p>`,
});

/* ------------------------------ support ------------------------------- */

const support = shell({
  title: 'Support',
  body: `  <h1>Support</h1>
  <p class="updated">Last updated ${SUPPORT_UPDATED}</p>

  <p>Email <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> and a person will
  read it. Tell us what device you are on and what happened, and if a screen looks
  wrong, a screenshot saves a lot of back and forth.</p>

  <h2>Where is my data?</h2>
  <p>On your phone. Tress has no account and no server of ours, so there is nothing
  for us to look up on your behalf. The app does make requests of its own, and they
  carry no photograph and nothing you write: when you scan a product, its barcode
  digits go to Open Beauty Facts and its picture comes back; and on iPhone, opening
  the subscription screen &mdash; the paywall &mdash; asks our subscription provider
  about this install, as do buying and restoring. If you never open that screen and never buy, that check does
  not happen. What else can leave is something you set off yourself &mdash; the share
  sheet, or a device backup &mdash; and the <a href="/privacy.html">privacy policy</a>
  takes those one at a time.</p>

  <h2>I have changed phone</h2>
  <p>Read this before you wipe the old one. There is no cloud copy for us to restore
  from, so what you are relying on is your phone&rsquo;s own backup &mdash; and on
  iPhone that does not bring everything.</p>
  <p><b>On iPhone,</b> a backup carries the photograph files across but not the record
  that describes them. The app keeps that record in storage that the library we use
  excludes from iCloud backup, so a restored iPhone opens at the beginning, with the
  images still on the phone but nothing pointing at them. <b>On Android,</b> the
  backup carries both, and the journey comes back with it.</p>
  <p>So if you are moving to a new iPhone, keep the old phone until you have seen what
  arrived. If your journey matters to you, share the updates you want to keep before
  you hand it in.</p>

  <h2>How do I delete everything?</h2>
  <p>Settings &rarr; <em>Delete all my data</em> deletes every photograph and
  thumbnail, cancels your reminders, and clears your journey, sessions, routine,
  journal and answers. Some things stay on the phone, and these are the ones worth
  knowing about: your appearance, reminder hour and capture options; the app lock,
  including the passcode in your keychain, so turn the lock off first if you want that
  gone too; the last membership answer the app had cached; product pictures the image
  cache kept from your scans; and the last image you handed to the share sheet.</p>
  <p>Deleting the app removes the storage the app keeps on the phone. The keychain is
  the phone&rsquo;s, not the app&rsquo;s, and whether a passcode saved there goes with
  the app is the phone&rsquo;s business rather than something Tress can tell you
  &mdash; so if you want the passcode gone, turn the app lock off before you delete
  anything.</p>
  <p>A backup made before you deleted anything still holds the photograph files until
  that backup is replaced or deleted, which is in your phone&rsquo;s backup settings
  rather than ours. And on iPhone, if this install has opened the subscription screen,
  bought or restored, our subscription provider holds a record against a random
  identifier for it; an install that has done none of those is not one it has heard
  of. Email us and we will have that record deleted; tell us roughly when you
  installed, because there is no name on it to search for.</p>

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

writeFileSync(
  join(OUT, 'google691387681f6abca7.html'),
  'google-site-verification: google691387681f6abca7.html\n',
);
writeFileSync(join(OUT, 'index.html'), home);
writeFileSync(join(OUT, 'support.html'), support);
writeFileSync(join(OUT, 'privacy.html'), privacy);
writeFileSync(join(OUT, 'terms.html'), terms);

for (const f of ['index.html', 'support.html', 'privacy.html', 'terms.html', 'google691387681f6abca7.html']) {
  console.log(`site/${f}`);
}
if (SUPPORT_EMAIL.includes('example')) {
  console.log('\n\u26a0  SUPPORT_EMAIL is still a placeholder. Set it before publishing.');
}
