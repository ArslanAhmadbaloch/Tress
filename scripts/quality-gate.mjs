/**
 * Tress quality gate.
 *
 *   node scripts/quality-gate.mjs
 *
 * Scores the app out of 10 across five weighted dimensions and exits
 * non-zero below the pass mark, so it can gate a commit or CI job.
 *
 * The point is to catch the classes of defect that reading code misses and
 * that a demo hides: routes that exist but are unreachable, screens with no
 * empty state, colours bypassing the token layer, controls with no
 * accessible name, and photo lists that would load full-resolution images.
 *
 * It deliberately does not try to judge taste. It measures the things that
 * have a right answer, and reports them honestly.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

const PASS_MARK = 8;
const FAIL_MARK = 7;

/* ------------------------------- helpers ------------------------------ */

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (['.ts', '.tsx'].includes(extname(entry))) out.push(full);
  }
  return out;
}

const FILES = walk(SRC).map((f) => ({
  path: f,
  rel: relative(ROOT, f),
  text: readFileSync(f, 'utf8'),
}));

const appFiles = FILES.filter((f) => f.rel.includes('src/app/'));
const screenFiles = appFiles.filter((f) => !f.rel.endsWith('_layout.tsx'));

function run(cmd, args) {
  try {
    execFileSync(cmd, args, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' });
    return { ok: true, output: '' };
  } catch (error) {
    return {
      ok: false,
      output: `${error.stdout ?? ''}${error.stderr ?? ''}`.trim(),
    };
  }
}

/* ----------------------------- dimensions ----------------------------- */

const checks = [];

function record(dimension, weight, name, passed, detail) {
  checks.push({ dimension, weight, name, passed, detail });
}

/* 1. Correctness — does it compile and lint clean? */

const tsc = run('npx', ['tsc', '--noEmit']);
record(
  'Correctness',
  3,
  'TypeScript compiles with no errors',
  tsc.ok,
  tsc.ok ? '' : tsc.output.split('\n').slice(0, 6).join('\n'),
);

const lint = run('npx', ['expo', 'lint', '--max-warnings', '0']);
record(
  'Correctness',
  1,
  'Lint passes with no warnings',
  lint.ok,
  lint.ok ? '' : lint.output.split('\n').slice(-12).join('\n'),
);

/* 2. Wiring — every route reachable, no dead links */

const routeNames = appFiles
  .filter((f) => !f.rel.endsWith('_layout.tsx'))
  .map((f) => {
    const r = f.rel
      .replace('src/app/', '')
      .replace(/\.tsx?$/, '')
      .replace(/\/index$/, '')
      .replace(/\(tabs\)\/?/, '')
      .replace(/^index$/, '');
    return '/' + r;
  })
  .map((r) => r.replace(/\/+$/, '') || '/');

const pushed = new Set();
for (const f of FILES) {
  for (const m of f.text.matchAll(/(?:router\.(?:push|replace)|href=)[(\s{"'`]+([^"'`)}\s]+)/g)) {
    const target = m[1].split('?')[0].replace(/\/\$\{.*/, '').replace(/\/\[.*/, '');
    if (target.startsWith('/')) pushed.add(target.replace(/\/+$/, '') || '/');
  }
  // Object-form navigation: router.push({ pathname: '/x', params }).
  for (const m of f.text.matchAll(/pathname:\s*['"`](\/[^'"`?]*)['"`]/g)) {
    pushed.add(m[1].replace(/\/+$/, '') || '/');
  }
}

const dynamicRoots = routeNames
  .filter((r) => r.includes('['))
  .map((r) => r.slice(0, r.indexOf('[')).replace(/\/+$/, ''));

/**
 * Tab screens are reached by the tab bar, not by router.push, so they are
 * "linked" if the bar declares an entry with their name. The bar is a
 * custom component now, so the declaration lives in its TABS table.
 */
const tabBarSource =
  FILES.find((f) => f.rel.endsWith('components/tab-bar.tsx'))?.text ?? '';
const declaredTabs = new Set(
  [...tabBarSource.matchAll(/name:\s*'([^']+)'/g)].map((m) =>
    m[1] === 'index' ? '/' : `/${m[1]}`,
  ),
);

const unreachable = routeNames.filter((r) => {
  if (r === '/' || r.includes('[')) return false;
  if (r.startsWith('/onboarding')) return false; // reached by the gate redirect
  if (declaredTabs.has(r)) return false; // reached by the tab bar
  return !pushed.has(r);
});

record(
  'Wiring',
  1,
  'Tab bar declares an entry for every tab screen',
  appFiles
    .filter((f) => f.rel.includes('(tabs)/') && !f.rel.endsWith('_layout.tsx'))
    .every((f) => {
      const name = f.rel.replace(/.*\(tabs\)\//, '').replace(/\.tsx$/, '');
      return declaredTabs.has(name === 'index' ? '/' : `/${name}`);
    }),
  `${declaredTabs.size} triggers declared`,
);

record(
  'Wiring',
  2,
  'Every route is linked from somewhere',
  unreachable.length === 0,
  unreachable.length ? `Unreachable: ${unreachable.join(', ')}` : '',
);

const brokenLinks = [...pushed].filter((target) => {
  if (routeNames.includes(target)) return false;
  return !dynamicRoots.some((root) => root && target.startsWith(root));
});

record(
  'Wiring',
  2,
  'No navigation targets a route that does not exist',
  brokenLinks.length === 0,
  brokenLinks.length ? `Missing: ${brokenLinks.join(', ')}` : '',
);

/* 3. Design system — tokens, not magic values */

// No /g flag: a global regex carries lastIndex between .test() calls and
// would report alternating false results across files.
const RAW_COLOR = /(?<![\w-])#[0-9a-fA-F]{3,8}\b|rgba?\(/;
const ALLOWED_RAW = [
  'src/theme/tokens.ts',
  'scripts/',
  // Camera and photo viewers sit on real black, which is not a themed
  // surface: it is the absence of one.
  'src/app/capture-session.tsx',
  'src/app/session/[id].tsx',
  'src/app/compare.tsx',
  'src/components/capture-ring.tsx',
  'src/components/ui/glass-surface.tsx',
];

const rawColorOffenders = FILES.filter(
  (f) => !ALLOWED_RAW.some((a) => f.rel.includes(a)) && RAW_COLOR.test(f.text),
).map((f) => f.rel);

record(
  'Design system',
  2,
  'Screens use colour tokens, not raw hex',
  rawColorOffenders.length === 0,
  rawColorOffenders.length ? `Raw colours in: ${rawColorOffenders.join(', ')}` : '',
);

const themedFiles = FILES.filter((f) => f.text.includes('useTheme()')).length;
record(
  'Design system',
  1,
  'Theme hook is used broadly (>15 files)',
  themedFiles > 15,
  `${themedFiles} files consume the theme`,
);

const darkDefined =
  readFileSync(join(SRC, 'theme', 'tokens.ts'), 'utf8').includes('darkColors');
record('Design system', 1, 'A dark palette is defined explicitly', darkDefined, '');

/* 3b. Liquid Glass — Apple's rules for the material, enforced */

// Glass belongs to the navigation/control layer. Content surfaces — cards,
// list rows, photo tiles — stay opaque so content stays the priority.
const CONTENT_COMPONENTS = ['card.tsx', 'option-card.tsx', 'stat.tsx'];
const glassOnContent = FILES.filter(
  (f) =>
    CONTENT_COMPONENTS.some((c) => f.rel.endsWith(c)) &&
    f.text.includes('GlassSurface'),
).map((f) => f.rel);

record(
  'Liquid Glass',
  2,
  'Glass is confined to chrome; content surfaces stay opaque',
  glassOnContent.length === 0,
  glassOnContent.length ? `Glass on content: ${glassOnContent.join(', ')}` : '',
);

// "Avoid overcrowding or layering Liquid Glass elements on top of each
// other." A GlassSurface directly wrapping another is the failure case.
const nestedGlass = FILES.filter((f) => {
  const opens = [...f.text.matchAll(/<GlassSurface\b/g)].length;
  if (opens < 2) return false;
  // Crude but effective: a second <GlassSurface before the first closes.
  const firstOpen = f.text.indexOf('<GlassSurface');
  const firstClose = f.text.indexOf('</GlassSurface>', firstOpen);
  const secondOpen = f.text.indexOf('<GlassSurface', firstOpen + 1);
  return secondOpen !== -1 && firstClose !== -1 && secondOpen < firstClose;
}).map((f) => f.rel);

record(
  'Liquid Glass',
  2,
  'No glass surface is nested inside another',
  nestedGlass.length === 0,
  nestedGlass.length ? `Nested glass in: ${nestedGlass.join(', ')}` : '',
);

const glassSource =
  FILES.find((f) => f.rel.endsWith('glass-surface.tsx'))?.text ?? '';

record(
  'Liquid Glass',
  2,
  'Reduce Transparency replaces the material with an opaque surface',
  glassSource.includes('reduceTransparency') &&
    glassSource.includes('useDisplayPreferences'),
  '',
);

record(
  'Liquid Glass',
  1,
  'Adjacent glass surfaces share a container rather than stacking',
  glassSource.includes('GlassContainer') &&
    FILES.some((f) => f.rel.includes('src/app/') && f.text.includes('GlassGroup')),
  '',
);

// Section headers moved to title case in the refresh; all-caps reads as a
// pre-refresh interface.
const shoutingHeaders = FILES.filter((f) => {
  if (!f.rel.includes('src/app/')) return false;
  if (/textTransform:\s*'uppercase'/.test(f.text)) return true;
  // An all-caps literal used as a header or an overline label. Two or more
  // consecutive caps-only words, so acronyms and single words like "OK"
  // do not trip it.
  return /(?:title=\{?"[A-Z][A-Z ]{3,}"|>\s*[A-Z][A-Z]+(?: [A-Z]+)+\s*<)/.test(
    f.text,
  );
}).map((f) => f.rel);

record(
  'Liquid Glass',
  1,
  'Section headers use title case, not all caps',
  shoutingHeaders.length === 0,
  shoutingHeaders.length ? `All-caps headers in: ${shoutingHeaders.join(', ')}` : '',
);

// Custom fixed chrome with content scrolling beneath needs a scroll edge
// effect, or text passing under it becomes unreadable.
const layoutSource =
  FILES.find((f) => f.rel.endsWith('components/ui/layout.tsx'))?.text ?? '';
record(
  'Liquid Glass',
  1,
  'A scroll edge effect exists and is applied to custom fixed chrome',
  layoutSource.includes('ScrollEdgeEffect') &&
    FILES.some(
      (f) =>
        !f.rel.endsWith('components/ui/layout.tsx') &&
        f.text.includes('<ScrollEdgeEffect'),
    ),
  '',
);

record(
  'Liquid Glass',
  1,
  'Nested shapes use concentric radii rather than arbitrary ones',
  FILES.some((f) => f.text.includes('concentricRadius')),
  '',
);

/* 3c. A displayed value must never be able to drift from its data */

// Animating a TextInput's `text` through useAnimatedProps also carries
// `defaultValue`, which React re-applies on the next re-render and reverts
// the shown text. A stat tile then disagrees with the data it was given.
const animatedTextOffenders = FILES.filter(
  (f) =>
    f.text.includes('useAnimatedProps') &&
    /defaultValue|text:\s*`/.test(f.text) &&
    f.text.includes('TextInput'),
).map((f) => f.rel);

record(
  'Design system',
  2,
  'No stat renders through an animated TextInput, which can revert to a stale value',
  animatedTextOffenders.length === 0,
  animatedTextOffenders.length
    ? `Fragile animated text in: ${animatedTextOffenders.join(', ')}`
    : '',
);

/* 4. Robustness — empty states, permissions, failure paths */

/**
 * Mapping over a module constant — a fixed set of appearance modes, or
 * the four reminder intervals — is not a list with an empty case. Only a
 * map over something that can arrive empty needs one, so the receiver has
 * to be an ordinary identifier rather than a SCREAMING_SNAKE constant.
 */
const mapsOverData = (text) =>
  [...text.matchAll(/([A-Za-z_$][\w$]*)\s*(?:\.[\w$]+)*\s*\.map\(/g)].some((m) => {
    const chain = m[0].slice(0, -'.map('.length);
    const receiver = chain.split('.').pop() ?? '';
    return !/^[A-Z0-9_]+$/.test(receiver);
  });

const listScreens = screenFiles.filter(
  (f) => mapsOverData(f.text) && f.text.includes('ScreenScroll'),
);
const withEmptyState = listScreens.filter(
  (f) => f.text.includes('EmptyState') || f.text.includes('length === 0'),
);

record(
  'Robustness',
  2,
  'Every list screen handles the empty case',
  withEmptyState.length === listScreens.length,
  listScreens.length
    ? `${withEmptyState.length}/${listScreens.length} list screens`
    : '',
);

const captureText =
  FILES.find((f) => f.rel.endsWith('capture-session.tsx'))?.text ?? '';
record(
  'Robustness',
  1,
  'Camera permission denial is handled, including "never ask again"',
  captureText.includes('canAskAgain') && captureText.includes('PermissionGate'),
  '',
);
record(
  'Robustness',
  1,
  'Photo save failure surfaces a human-readable error',
  captureText.includes('Alert.alert') && captureText.includes("Couldn't save"),
  '',
);

const storeText = readFileSync(join(SRC, 'store', 'app-store.tsx'), 'utf8');
record(
  'Robustness',
  1,
  'Corrupt local storage does not crash the app',
  storeText.includes('.catch(') && storeText.includes('JSON.parse'),
  '',
);

/* 5. Accessibility & performance */

const interactive = FILES.filter((f) => f.text.includes('PressableScale'));
const missingLabels = interactive.filter((f) => {
  const presses = (f.text.match(/<PressableScale/g) ?? []).length;
  const labels = (f.text.match(/accessibilityLabel|accessibilityRole/g) ?? []).length;
  return labels < presses;
});

record(
  'Accessibility',
  2,
  'Interactive elements carry accessibility metadata',
  missingLabels.length === 0,
  missingLabels.length ? `Thin coverage in: ${missingLabels.map((f) => f.rel).join(', ')}` : '',
);

record(
  'Accessibility',
  1,
  'Motion respects the reduced-motion setting',
  FILES.some((f) => f.text.includes('useReducedMotion')),
  '',
);

// Lists must read thumbnails; only detail/viewer screens may use full-res.
// The paywall hero is one large image on a detail-like screen, loaded at
// full resolution with the thumbnail as its placeholder on purpose — the
// 320px thumbnail would blur across a 340pt frame. Not a list.
const FULL_RES_OK = ['session/[id].tsx', 'compare.tsx', 'capture-session.tsx', 'subscription/hero.tsx'];
const listImageOffenders = FILES.filter((f) => {
  if (FULL_RES_OK.some((ok) => f.rel.endsWith(ok))) return false;
  if (!f.text.includes('<Image')) return false;
  const usesFull = /source=\{\{\s*uri:\s*\w+\.uri\s*\}\}/.test(f.text);
  return usesFull;
}).map((f) => f.rel);

record(
  'Performance',
  2,
  'Photo lists load thumbnails, never full-resolution files',
  listImageOffenders.length === 0,
  listImageOffenders.length ? `Full-res in lists: ${listImageOffenders.join(', ')}` : '',
);

const photoStorage = readFileSync(join(SRC, 'lib', 'photo-storage.ts'), 'utf8');
record(
  'Performance',
  1,
  'Captured photos are downscaled and a thumbnail is generated',
  photoStorage.includes('THUMB_MAX_WIDTH') && photoStorage.includes('FULL_MAX_WIDTH'),
  '',
);

/* 6. Android parity — the platform that gets tested second */

/**
 * Three things that were all silently wrong the first time this app was
 * run on Android, and that no amount of reading the iOS screens catches.
 */
const tokensText = readFileSync(join(SRC, 'theme', 'tokens.ts'), 'utf8');

// A bundled family gives Android no weights and no italic of its own, so
// every serif style the app uses has to be a named face.
const serifFaces =
  /serif:\s*'Lora_/.test(tokensText) &&
  /serifItalic:\s*'Lora_.*Italic'/.test(tokensText) &&
  /serifSemibold:\s*'Lora_/.test(tokensText);

const serifLoaded = readFileSync(join(SRC, 'app', '_layout.tsx'), 'utf8');
const serifRegistered =
  ['Lora_400Regular', 'Lora_400Regular_Italic', 'Lora_600SemiBold'].every((f) =>
    serifLoaded.includes(f),
  );

record(
  'Android',
  1,
  'The serif is bundled and every cut it uses is named and loaded',
  serifFaces && serifRegistered,
  serifFaces ? 'A face is declared but never loaded at launch' : 'Android would fall back to Noto Serif',
);

// Elevation is a distance, not a blur radius. The defaults that look
// right beside a 26pt iOS shadow are roughly half its radius.
const elevations = [...tokensText.matchAll(/elevation:\s*(\d+)/g)].map((m) => Number(m[1]));
record(
  'Android',
  1,
  'Shadow tokens carry an elevation deep enough to read',
  elevations.length >= 2 && Math.max(...elevations) >= 10,
  elevations.length ? `Deepest elevation is ${Math.max(...elevations)}` : 'No elevation set at all',
);

// An iOS-only native module reached without a platform guard is a crash
// on Android, and neither tsc nor the linter can see it.
const IOS_ONLY = ['expo-symbols', 'expo-glass-effect'];
const unguarded = FILES.filter((f) => {
  if (!IOS_ONLY.some((m) => f.text.includes(`from '${m}'`))) return false;
  return !/Platform\.OS === 'ios'|isLiquidGlassAvailable/.test(f.text);
}).map((f) => f.rel);

record(
  'Android',
  1,
  'iOS-only modules are only reached behind a platform check',
  unguarded.length === 0,
  unguarded.length ? `Unguarded: ${unguarded.join(', ')}` : '',
);

/* 6. Product safety — the medical guardrail is not optional here */

const safetyCopy = FILES.filter(
  (f) =>
    f.text.includes('does not provide') ||
    f.text.includes('does not recommend') ||
    f.text.includes('qualified healthcare'),
).length;

record(
  'Safety',
  2,
  'Medical disclaimer appears in onboarding, routine and settings',
  safetyCopy >= 3,
  `${safetyCopy} surfaces carry the guardrail`,
);

// Educational content is the new medical-risk surface: it is where the
// product is most tempted to slide from explaining into advising.
const learnLibrary =
  FILES.find((f) => f.rel.includes('features/learn/library'))?.text ?? '';
const learnScreens = FILES.filter((f) => f.rel.includes('/learn'));

/**
 * Comments are stripped first: the authoring rules in library.ts quote the
 * very phrases they forbid ("no claims of guaranteed growth"), and a check
 * that flags its own rulebook is noise rather than signal.
 */
const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const advisoryLanguage =
  /\b(you should take|we recommend|this will regrow|is guaranteed to)\b/i;

const offenders = learnScreens
  .filter((f) => advisoryLanguage.test(stripComments(f.text)))
  .map((f) => f.rel);

record(
  'Safety',
  1,
  'Learn content explains rather than advises, and carries the disclaimer',
  offenders.length === 0 &&
    learnLibrary.includes('never cross from education into advice') &&
    learnScreens.some((f) => f.text.includes('does not diagnose')),
  offenders.length ? `Advisory language in: ${offenders.join(', ')}` : '',
);

/* ------------------------------- scoring ------------------------------ */

const byDimension = new Map();
for (const c of checks) {
  const d = byDimension.get(c.dimension) ?? { earned: 0, total: 0, checks: [] };
  d.total += c.weight;
  if (c.passed) d.earned += c.weight;
  d.checks.push(c);
  byDimension.set(c.dimension, d);
}

const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
const earnedWeight = checks.reduce((s, c) => s + (c.passed ? c.weight : 0), 0);
const score = (earnedWeight / totalWeight) * 10;

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const OFF = '\x1b[0m';

console.log(`\n${BOLD}Tress — quality gate${OFF}\n`);

for (const [dimension, d] of byDimension) {
  const pct = ((d.earned / d.total) * 10).toFixed(1);
  console.log(`${BOLD}${dimension}${OFF} ${DIM}${pct}/10${OFF}`);
  for (const c of d.checks) {
    const mark = c.passed ? `${GREEN}pass${OFF}` : `${RED}FAIL${OFF}`;
    console.log(`  ${mark}  ${c.name}`);
    if (!c.passed && c.detail) {
      for (const line of c.detail.split('\n')) {
        console.log(`        ${DIM}${line}${OFF}`);
      }
    }
  }
  console.log('');
}

const failures = checks.filter((c) => !c.passed);
console.log(
  `${BOLD}Score: ${score.toFixed(1)}/10${OFF}  (${checks.length - failures.length}/${checks.length} checks, weighted)`,
);

if (score < FAIL_MARK) {
  console.log(`${RED}Below ${FAIL_MARK}. Fix the failures above and re-run until ${PASS_MARK}+.${OFF}\n`);
  process.exit(1);
}
if (score < PASS_MARK) {
  console.log(`${RED}Below the ${PASS_MARK} pass mark.${OFF}\n`);
  process.exit(1);
}
console.log(`${GREEN}Passes the ${PASS_MARK}/10 bar.${OFF}\n`);
