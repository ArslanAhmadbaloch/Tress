/**
 * The hairstyle catalogue is a table of haircuts, and the picker is a
 * filter over it with tie-breakers. Both are held here to what they
 * claim to be: every entry has a drawing on disk and valid tags; every
 * hair type has enough cuts for either gender; the picks for a record
 * are three to five, all cut on the record's hair type, the same every
 * time; the tie-breakers move cuts in the direction the answers point
 * and no further; and no name, note or sentence says a cut suits
 * anybody, does anything for anybody, or reads the scan.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  HAIRSTYLE_CATALOGUE,
  HAIRSTYLE_COPY,
  HAIRSTYLE_PICKS_MAX,
  HAIRSTYLE_PICKS_MIN,
  hairstyleCopySentences,
  hairstyleCountFor,
  hairstyleProfileOf,
  hairstyleScore,
  hairstylesFor,
  hairstylesForProfile,
  moreHairstylesFor,
  traitWeights,
  type HairLength,
  type HairstyleTrait,
} from '@/features/hairstyles';
import {
  EMPTY_DATA,
  HAIR_CONCERN_LABELS,
  HAIR_GOAL_LABELS,
  HAIR_TYPE_LABELS,
  type AppData,
  type Gender,
  type HairConcern,
  type HairGoal,
  type HairType,
  type Journey,
} from '@/types/domain';

import { HAIR_CLAIMS } from './claims';
import { assertHonest } from './honesty-words';

/* ------------------------------ fixtures ------------------------------- */

const HAIR_TYPES = Object.keys(HAIR_TYPE_LABELS) as HairType[];
const GENDERS: (Gender | undefined)[] = ['male', 'female', undefined];
const LENGTHS: HairLength[] = ['short', 'medium', 'long'];
const TRAITS: HairstyleTrait[] = ['volumeOnTop', 'lowManipulation', 'tension'];

function journey(overrides: Partial<Journey> = {}): Journey {
  return {
    id: 'j1',
    profileId: 'p1',
    startedAt: '2026-09-01T00:00:00.000Z',
    trackingAreas: ['hairline'],
    motivations: ['confidence'],
    goals: ['overall'],
    noticed: 'halfYear',
    triggers: ['mirror'],
    approaches: ['topical'],
    updateIntervalDays: 30,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function record(parts: { hairType?: HairType; gender?: Gender; goals?: HairGoal[]; concerns?: HairConcern[] } = {}): AppData {
  return {
    ...EMPTY_DATA,
    profile: { id: 'p1', displayName: 'Sam', createdAt: '2026-09-01T00:00:00.000Z', gender: parts.gender },
    journey: journey({ hairType: parts.hairType, goals: parts.goals ?? ['overall'], concerns: parts.concerns ?? [] }),
    onboardingCompletedAt: '2026-09-01T00:00:00.000Z',
  };
}

/** The bundled drawing's path on disk: the test stand-in for `require` returns the module path. */
function assetPath(image: unknown): string {
  assert.equal(typeof image, 'string', 'under node --test, require() returns the path');
  return (image as string).replace(/^@\//, '');
}

/* ------------------------------ catalogue ------------------------------ */

test('catalogue: forty-odd cuts, unique ids, every drawing on disk, every tag in the vocabulary', () => {
  assert.ok(HAIRSTYLE_CATALOGUE.length >= 36, `${HAIRSTYLE_CATALOGUE.length} entries`);
  const ids = new Set<string>();
  const images = new Set<string>();
  for (const s of HAIRSTYLE_CATALOGUE) {
    assert.match(s.id, /^[a-z0-9-]+$/, `${s.id} is a slug`);
    assert.ok(!ids.has(s.id), `${s.id} is listed twice`);
    ids.add(s.id);
    const path = assetPath(s.image);
    assert.ok(existsSync(path), `${s.id}: ${path} is missing`);
    assert.ok(!images.has(path), `${s.id} shares a drawing with another cut`);
    images.add(path);
    assert.ok(s.lengths.length > 0 && s.lengths.every((l) => LENGTHS.includes(l)), `${s.id}: lengths`);
    assert.ok(s.hairTypes.length > 0 && s.hairTypes.every((t) => HAIR_TYPES.includes(t)), `${s.id}: hair types`);
    assert.ok(['male', 'female', 'any'].includes(s.gender), `${s.id}: gender`);
    assert.ok(s.traits.every((t) => TRAITS.includes(t)), `${s.id}: traits`);
    assert.equal(new Set(s.traits).size, s.traits.length, `${s.id}: a trait twice`);
    assert.ok(s.name.length > 0 && s.name.length <= 24, `${s.id}: a name, not a sentence`);
    assert.match(s.note, /^[A-Z]/, `${s.id}: the note starts with a capital`);
    assert.match(s.note, /\.$/, `${s.id}: the note ends with a full stop`);
    assert.ok(s.note.length <= 170, `${s.id}: one line, not a paragraph (${s.note.length})`);
  }
  // Every length and every hair type is somewhere in the catalogue.
  for (const l of LENGTHS) assert.ok(HAIRSTYLE_CATALOGUE.some((s) => s.lengths.includes(l)), l);
  for (const t of HAIR_TYPES) assert.ok(HAIRSTYLE_CATALOGUE.some((s) => s.hairTypes.includes(t)), t);
  // The order the file promises, which is the order ties are broken in: the
  // men's set, the women's set, then the cuts drawn for everybody. A cut
  // for everybody placed inside a gendered block would head every list for
  // the other gender, so the blocks are held to their boundaries.
  const genders = HAIRSTYLE_CATALOGUE.map((s) => s.gender);
  const firstAny = genders.indexOf('any');
  const lastFemale = genders.lastIndexOf('female');
  const lastMale = genders.lastIndexOf('male');
  assert.ok(firstAny > lastFemale && lastFemale > lastMale, 'men, then women, then everybody, with no cut out of its block');
});

test('catalogue: every trait an entry carries is one the picker weighs, so no tag is decoration', () => {
  const weighed = traitWeights({ goals: ['crown', 'lessBreakage'], concerns: [] });
  for (const trait of TRAITS) assert.notEqual(weighed[trait], undefined, `${trait} never moves a pick`);
  const carried = new Set(HAIRSTYLE_CATALOGUE.flatMap((s) => s.traits));
  for (const trait of carried) assert.ok(TRAITS.includes(trait), trait);
});

test('catalogue: the bundled drawings stay inside the asset budget', () => {
  let bytes = 0;
  for (const s of HAIRSTYLE_CATALOGUE) bytes += readFileSync(assetPath(s.image)).byteLength;
  assert.ok(bytes < 6 * 1024 * 1024, `${(bytes / 1024 / 1024).toFixed(2)} MB of drawings`);
});

test('catalogue: every hair type has at least three cuts for either gender, and the cuts for everybody cover every hair type', () => {
  for (const hairType of HAIR_TYPES) {
    for (const gender of GENDERS) {
      const n = hairstylesForProfile({ hairType, gender }).length;
      assert.ok(n >= HAIRSTYLE_PICKS_MIN, `${hairType}/${gender ?? 'unknown'}: only ${n}`);
    }
  }
  const forEveryone = hairstylesForProfile({ hairType: undefined, gender: undefined });
  assert.ok(forEveryone.length >= HAIRSTYLE_PICKS_MIN);
  assert.ok(forEveryone.every((s) => s.gender === 'any'));
  for (const t of HAIR_TYPES) assert.ok(forEveryone.some((s) => s.hairTypes.includes(t)), `no cut for everybody is cut on ${t} hair`);
});

/* -------------------------------- picker ------------------------------- */

test('picker: three to five cuts, every one cut on the hair type and drawn for the gender, the same list every time', () => {
  const goalSets: HairGoal[][] = [['overall'], ['crown'], ['lessBreakage'], ['hairline', 'shedding'], []];
  const concernSets: HairConcern[][] = [[], ['moreScalpShowing'], ['breakage', 'dryness'], ['frizz']];
  for (const hairType of [...HAIR_TYPES, undefined]) {
    for (const gender of GENDERS) {
      for (const goals of goalSets) {
        for (const concerns of concernSets) {
          const data = record({ hairType, gender, goals, concerns });
          const picks = hairstylesFor(data);
          const label = `${hairType ?? 'unknown'}/${gender ?? 'unknown'}/${goals.join('+')}/${concerns.join('+')}`;
          assert.ok(picks.length >= HAIRSTYLE_PICKS_MIN && picks.length <= HAIRSTYLE_PICKS_MAX, `${label}: ${picks.length} picks`);
          assert.equal(new Set(picks.map((s) => s.id)).size, picks.length, `${label}: a cut twice`);
          for (const s of picks) {
            if (hairType !== undefined) assert.ok(s.hairTypes.includes(hairType), `${label}: ${s.id} is not cut on ${hairType} hair`);
            else assert.equal(s.gender, 'any', `${label}: ${s.id} is not drawn for everybody`);
            if (gender !== undefined) assert.ok(s.gender === 'any' || s.gender === gender, `${label}: ${s.id} is drawn for the other set`);
          }
          // Deterministic: the same record, and a copy of it, get the same list in the same order.
          assert.deepEqual(hairstylesFor(data).map((s) => s.id), picks.map((s) => s.id), label);
          assert.deepEqual(hairstylesFor(structuredClone(data)).map((s) => s.id), picks.map((s) => s.id), label);
          // The picks and the rest partition the catalogue's entries for the record.
          const rest = moreHairstylesFor(data);
          const all = hairstylesForProfile(hairstyleProfileOf(data));
          assert.equal(picks.length + rest.length, all.length, `${label}: picks and the rest`);
          assert.ok(rest.every((s) => !picks.some((p) => p.id === s.id)), `${label}: a pick in the rest`);
          assert.equal(hairstyleCountFor(data), all.length, `${label}: the count is the catalogue's`);
        }
      }
    }
  }
});

test('picker: with no answers to break ties, the picks are the catalogue’s first entries for the hair type', () => {
  const data = record({ hairType: 'straight', gender: 'male', goals: [], concerns: [] });
  const all = hairstylesForProfile({ hairType: 'straight', gender: 'male' });
  assert.deepEqual(hairstylesFor(data).map((s) => s.id), all.slice(0, HAIRSTYLE_PICKS_MAX).map((s) => s.id));
  assert.deepEqual(traitWeights(hairstyleProfileOf(data)), {});
});

test('picker: a woman’s first suggestion is drawn for women, whatever her hair type or goal', () => {
  // The first card is the one a free reader sees clear, on /hairstyles and
  // on the report; it must never be a drawing from the men's set.
  for (const hairType of HAIR_TYPES) {
    // With nothing to break ties, the women's set comes first by catalogue order.
    const plain = hairstylesFor(record({ hairType, gender: 'female', goals: [] }))[0];
    assert.equal(plain.gender, 'female', `${hairType}: ${plain.id} heads the list`);
    // With a goal, a cut drawn for everybody may outrank it (the tapered afro
    // over the two coily styles worn under tension), but never one from the men's set.
    for (const goals of [['crown'], ['hairline'], ['lessBreakage']] as HairGoal[][]) {
      const first = hairstylesFor(record({ hairType, gender: 'female', goals }))[0];
      assert.notEqual(first.gender, 'male', `${hairType}/${goals.join('+')}: ${first.id} heads the list`);
      assert.ok(!first.traits.includes('tension'), `${hairType}/${goals.join('+')}: a style that pulls heads the list`);
    }
  }
  assert.equal(HAIRSTYLE_CATALOGUE.find((s) => s.id === 'undercut')?.gender, 'male', 'the undercut is drawn for the men’s set');
});

test('picker: a record about scalp showing leans toward cuts with volume on top and away from styles worn under tension', () => {
  const weights = traitWeights({ goals: ['crown'], concerns: [] });
  assert.ok((weights.volumeOnTop ?? 0) > 0);
  assert.ok((weights.tension ?? 0) < 0);
  assert.equal(weights.lowManipulation, undefined);
  const concern = traitWeights({ goals: [], concerns: ['moreScalpShowing'] });
  assert.deepEqual(concern, weights, 'the concern and the goal point the same way');

  const data = record({ hairType: 'coily', gender: 'female', goals: ['crown'] });
  const picks = hairstylesFor(data);
  const scores = picks.map((s) => hairstyleScore(s, weights));
  for (let i = 1; i < scores.length; i += 1) assert.ok(scores[i] <= scores[i - 1], 'best score first');
  const tapered = picks.findIndex((s) => s.id === 'tapered-afro');
  const puff = picks.findIndex((s) => s.id === 'high-puff');
  assert.ok(tapered !== -1, 'a cut with volume on top is in');
  assert.ok(puff === -1 || puff > tapered, 'a style that pulls comes after it, or not at all');
});

test('picker: a record about breakage leans toward cuts that are handled least, and away from tension', () => {
  const weights = traitWeights({ goals: ['lessBreakage'], concerns: [] });
  assert.ok((weights.lowManipulation ?? 0) > 0);
  assert.ok((weights.tension ?? 0) < 0);
  assert.equal(weights.volumeOnTop, undefined);
  for (const concern of ['breakage', 'shedding', 'dryness'] as HairConcern[]) {
    assert.deepEqual(traitWeights({ goals: [], concerns: [concern] }), weights, concern);
  }
  const data = record({ hairType: 'curly', gender: 'female', goals: ['lessBreakage'] });
  const picks = hairstylesFor(data);
  const rest = moreHairstylesFor(data);
  const best = Math.max(...rest.map((s) => hairstyleScore(s, weights)));
  for (const s of picks) assert.ok(hairstyleScore(s, weights) >= best, `${s.id} is outranked by a cut left out`);
  assert.ok(picks.every((s) => s.traits.includes('lowManipulation')), 'every pick is a cut handled least');
  assert.ok(!picks.some((s) => s.traits.includes('tension')), 'no pick is worn under tension');
  assert.ok(rest.some((s) => s.traits.includes('tension')), 'and the catalogue does hold such styles for this hair');
  // Every other answer is not a tie-breaker: the picks are the catalogue's order.
  assert.deepEqual(traitWeights({ goals: ['routineWorking', 'unsure'], concerns: ['frizz', 'greying', 'oilyRoots'] }), {});
});

test('picker: an answer the app never offered is ignored, and a missing journey reads as no answers', () => {
  const odd = record({ hairType: 'wavy', gender: 'female' });
  (odd.journey as unknown as { hairType: string }).hairType = 'silky';
  (odd.journey as unknown as { concerns: string[] }).concerns = ['moreScalpShowing', 'glossy'];
  const profile = hairstyleProfileOf(odd);
  assert.equal(profile.hairType, undefined);
  assert.deepEqual(profile.concerns, ['moreScalpShowing']);
  assert.deepEqual(hairstyleProfileOf({ ...EMPTY_DATA }), { hairType: undefined, gender: undefined, goals: [], concerns: [] });
  assert.ok(hairstylesFor({ ...EMPTY_DATA }).length >= HAIRSTYLE_PICKS_MIN, 'a fresh install still gets a list');
});

/* ------------------------------- honesty ------------------------------- */

/** Words that would make a haircut a verdict on the person, or a promise. */
const STYLING_CLAIMS = [
  'suit', 'flatter', 'younger', 'older', 'slimmer', 'thicker', 'fuller', 'thinner', 'hide', 'hides', 'disguise', 'conceal', 'cover up',
  'improve', 'prevent', 'restore', 'regrow', 'reverse', 'so that', 'in order to', 'will help', 'helps to', 'promote', 'stimulate',
  'boost', 'strengthen', 'density', 'progress', 'thinning', 'stage', 'hair loss', 'losing', 'receding', 'follicle',
];

function sweep(sentences: string[], context: string): void {
  assertHonest(assert, sentences, context);
  const text = sentences.join(' ');
  const lower = text.toLowerCase();
  for (const claim of [...HAIR_CLAIMS, ...STYLING_CLAIMS]) {
    assert.ok(!lower.includes(claim), `${context} must not say "${claim}"`);
  }
  assert.ok(!/\bwill\b/i.test(text), `${context} makes a promise: ${text}`);
  assert.ok(!/\b(before|after)\b/i.test(text), `${context} promises a comparison: ${text}`);
  assert.ok(!/\b(you look|you'll look|looks good on|good for you|made for you|suits you|right for your face)\b/i.test(text), context);
}

test('honesty: every name and note is about the cut — what it is and what it needs — never about the person', () => {
  const names = HAIRSTYLE_CATALOGUE.map((s) => s.name);
  const notes = HAIRSTYLE_CATALOGUE.map((s) => s.note);
  sweep(names, 'hairstyle names');
  sweep(notes, 'hairstyle notes');
  for (const s of HAIRSTYLE_CATALOGUE) {
    assert.ok(!/\byou(r)?\b/i.test(s.note), `${s.id}: the note is about the cut, not the reader: ${s.note}`);
    assert.ok(!/\b(face shape|round face|oval|square face|long face|heart-shaped)\b/i.test(s.note), `${s.id}: no face-shape verdicts`);
  }
});

test('honesty: the feature’s copy is styling suggestions for a hair type, whose fit is a stylist’s call, and reads no scan', () => {
  const sentences = hairstyleCopySentences();
  assert.ok(sentences.length >= 30, `only ${sentences.length} sentences reached the sweep`);
  assert.ok(sentences.includes(HAIRSTYLE_COPY.subtitle('wavy')), 'the functions are called, not skipped');
  sweep(sentences, 'hairstyle copy');
  assert.match(HAIRSTYLE_COPY.subtitle(undefined), /stylist/, 'whose call it is');
  assert.match(HAIRSTYLE_COPY.subtitle('coily'), /stylist/);
  assert.match(HAIRSTYLE_COPY.report.subheading, /stylist/);
  assert.match(HAIRSTYLE_COPY.disclaimer, /scan/, 'and that the scan plays no part');
  // Numbers reach the copy only as arguments: no literal figure is authored.
  for (const s of [...Object.values(HAIRSTYLE_COPY.title), HAIRSTYLE_COPY.disclaimer, HAIRSTYLE_COPY.locked.note, HAIRSTYLE_COPY.report.subheading]) {
    assert.ok(!/\d/.test(s), `a figure in fixed copy: ${s}`);
  }
  // The counted sentences say what they count. With no hair type the count
  // is the cuts drawn for everybody, not the catalogue, and the words say so.
  const forEveryone = hairstylesForProfile({ hairType: undefined, gender: undefined }).length;
  assert.equal(hairstyleCountFor({ ...EMPTY_DATA }), forEveryone);
  assert.ok(forEveryone < HAIRSTYLE_CATALOGUE.length, 'the count is not the whole catalogue');
  assert.match(HAIRSTYLE_COPY.home.body(forEveryone, undefined), /everybody/);
  assert.ok(!/catalogue/.test(HAIRSTYLE_COPY.home.body(forEveryone, undefined)), 'the Home card does not call the everybody set the catalogue');
  assert.match(HAIRSTYLE_COPY.more.subheading(3, undefined), /everybody/);
  assert.match(HAIRSTYLE_COPY.home.body(9, 'wavy'), /^9 .*wavy hair\.$/);
  // The hair type words the copy uses are the funnel's own labels, lower-cased.
  for (const t of HAIR_TYPES) assert.ok(HAIRSTYLE_COPY.subtitle(t).includes(`${HAIR_TYPE_LABELS[t].toLowerCase()} hair`), t);
});

test('honesty: the tie-breakers read the answers as given, in the funnel’s own vocabulary', () => {
  // Every goal and concern the picker names is one the funnel offers.
  const goals = Object.keys(HAIR_GOAL_LABELS);
  const concerns = Object.keys(HAIR_CONCERN_LABELS);
  const source = readFileSync('src/features/hairstyles/picker.ts', 'utf8');
  for (const m of source.matchAll(/VOLUME_GOALS: readonly HairGoal\[\] = \[([^\]]+)\]/g)) {
    for (const g of m[1].split(',').map((x) => x.trim().replace(/'/g, ''))) assert.ok(goals.includes(g), g);
  }
  for (const m of source.matchAll(/HANDLING_CONCERNS: readonly HairConcern\[\] = \[([^\]]+)\]/g)) {
    for (const c of m[1].split(',').map((x) => x.trim().replace(/'/g, ''))) assert.ok(concerns.includes(c), c);
  }
});

/* -------------------------------- wiring ------------------------------- */

test('wiring: the route exists and is registered, and Home and the report lead to it', () => {
  const route = readFileSync('src/app/hairstyles.tsx', 'utf8');
  const layout = readFileSync('src/app/_layout.tsx', 'utf8');
  const home = readFileSync('src/app/(tabs)/index.tsx', 'utf8');
  const report = readFileSync('src/components/hair-scan/report.tsx', 'utf8');
  const section = readFileSync('src/components/hair-scan/report-sections/hairstyles.tsx', 'utf8');
  const card = readFileSync('src/components/hairstyles/style-card.tsx', 'utf8');
  const paywall = readFileSync('src/app/paywall.tsx', 'utf8');
  assert.match(layout, /name="hairstyles"/);
  assert.match(home, /router\.push\('\/hairstyles'\)/);
  assert.match(report, /router\.push\('\/hairstyles'\)/);
  assert.match(report, /case 'hairstyles':/);
  // The paywall names hairstyles as a benefit and does not link to the list; the
  // layout's comment says the same, so neither overclaims a way in.
  assert.ok(!/\/hairstyles/.test(paywall), 'the paywall does not link to /hairstyles');
  assert.match(layout, /does not link to it/);
  // Every word on the screen is the copy file's: no title, eyebrow or label is authored in the route.
  assert.ok(!/\b(title|titleMuted|eyebrow|label|subtitle)="/.test(route), 'a string prop authored in the route');
  assert.match(route, /title=\{COPY\.title\.main\}/);
  // One blur radius for both held surfaces: the section imports the card's, it does not keep a copy.
  assert.match(section, /import \{ HELD_BLUR \} from '@\/components\/hairstyles'/);
  assert.ok(!/const HELD_BLUR/.test(section), 'the section declares its own blur radius');
  // The gate the paywall's hairstyle line rests on: the first suggestion free, the rest held, one button to the paywall.
  assert.match(route, /usePremium\(\)/);
  assert.match(route, /held=\{!isPremium && i > 0\}/);
  assert.match(route, /router\.push\('\/paywall'\)/);
  assert.equal(route.match(/onPress=\{toPaywall\}/g)?.length, 1, 'one button to the paywall');
  // A held drawing is blurred by the image itself, not covered by a blur view Android cannot draw.
  assert.match(card, /blurRadius=\{held \? HELD_BLUR : 0\}/);
  assert.match(section, /blurRadius=\{held \? HELD_BLUR : 0\}/);
  assert.ok(!/BlurView/.test(card) && !/BlurView/.test(section));
  // The report section is the model's: no copy file read directly, no sentence computed.
  assert.ok(!section.includes('HAIR_SCAN_REPORT_MODEL_COPY'));
  assert.match(section, /block\.locked && i > 0/, 'the first tile is clear, the rest are held');
  // Every screen that animates reads Reduce Motion.
  for (const [name, source] of [['route', route], ['card', card], ['section', section]] as const) {
    if (/useSharedValue|withSpring|withTiming|entering=|useAnimatedStyle/.test(source)) {
      assert.match(source, /useReducedMotion\(\)/, `${name} animates without reading Reduce Motion`);
    }
  }
});
