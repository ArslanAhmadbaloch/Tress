/**
 * The one image that leaves the app carrying photographs.
 *
 * Everything else the product says is checked for honesty on the way to a
 * screen somebody can close. This copy travels: it lands in a message to a
 * clinician, or in a folder, months after the app that wrote it was last
 * opened. So each line is pinned to the mechanism it describes — the
 * footer must say "between" exactly when the set spans days, nothing may
 * claim an outcome `expo-sharing` cannot report, and the person's own
 * words for the update must be provably absent from the file.
 *
 * Expected strings are computed with the same date helpers the builder
 * uses: `toLocaleDateString` is locale-dependent under node, and a
 * hand-typed "15 Sep 2026" would assert the runner's locale rather than
 * the code.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  SHARE_COPY,
  buildSessionSheet,
  shareCopySentences,
} from '@/features/share/session-sheet';
import { formatDate, formatDateShort, formatMilestone, toDateKey } from '@/lib/date';
import { ANGLES, ANGLE_LABELS, type Angle, type Photo, type PhotoSession } from '@/types/domain';
import { assertHonest } from './honesty-words';

/** Words that would mean the app had started selling an outcome. */
const FUNNEL =
  /\b(thicker|fuller|regrow|regrowth|restore|restored|improve|improved|improvement|norwood|diagnos\w*|severe|advanced|guarantee\w*|results?)\b/i;

const JOURNEY_STARTED = '2026-06-15T09:00:00.000Z';
const SESSION_AT = '2026-09-15T10:00:00.000Z';

function photo(angle: Angle, iso: string): Photo {
  return {
    id: `p-${angle}`,
    sessionId: 's1',
    angle,
    uri: `file:///p/${angle}.jpg`,
    thumbnailUri: `file:///p/${angle}-t.jpg`,
    width: 1440,
    height: 1850,
    capturedAt: iso,
  };
}

const sameDayPhotos = ANGLES.map((angle, i) =>
  photo(angle, `2026-09-15T10:0${i}:00.000Z`),
);

const sameDay: PhotoSession = {
  id: 's1',
  journeyId: 'j1',
  capturedAt: SESSION_AT,
  isBaseline: false,
  photos: sameDayPhotos,
};

/** An angle filled in on a later day, the way `addMissingAngles` allows. */
const extended: PhotoSession = {
  ...sameDay,
  photos: sameDayPhotos.map((p) =>
    p.angle === 'crown' ? photo('crown', '2026-10-03T09:00:00.000Z') : p,
  ),
};

const baseline: PhotoSession = {
  id: 's0',
  journeyId: 'j1',
  capturedAt: JOURNEY_STARTED,
  isBaseline: true,
  photos: [photo('front', JOURNEY_STARTED)],
};

function build(session: PhotoSession, baselineCapturedAt: string | null = JOURNEY_STARTED) {
  return buildSessionSheet({ session, journeyStartedAt: JOURNEY_STARTED, baselineCapturedAt });
}

/** Every string that ends up on the image, for the sweeps. */
function sheetStrings(session: PhotoSession): string[] {
  const sheet = build(session);
  return [
    sheet.heading,
    sheet.dateLine,
    ...(sheet.baselineLine ? [sheet.baselineLine] : []),
    ...sheet.frames.map((f) => f.caption),
    sheet.footer,
    sheet.accessibilityLabel,
  ];
}

test('frames are the record, in the record order', () => {
  const shuffled: PhotoSession = {
    ...sameDay,
    photos: [...sameDayPhotos].reverse(),
  };
  const sheet = build(shuffled);

  assert.deepEqual(sheet.frames.map((f) => f.angle), [...ANGLES]);
  for (const frame of sheet.frames) {
    assert.equal(frame.label, ANGLE_LABELS[frame.angle]);
    // The full file, never the thumbnail: this is the one place where the
    // resolution is the point.
    assert.equal(frame.source.uri, `file:///p/${frame.angle}.jpg`);
  }
});

test('a duplicated angle keeps the later shutter', () => {
  const later = photo('top', '2026-09-15T18:30:00.000Z');
  later.uri = 'file:///p/top-later.jpg';
  const sheet = build({ ...sameDay, photos: [...sameDayPhotos, later] });

  const top = sheet.frames.filter((f) => f.angle === 'top');
  assert.equal(top.length, 1);
  assert.equal(top[0].source.uri, 'file:///p/top-later.jpg');
});

test('captions carry each photograph own date', () => {
  const sheet = build(extended);
  for (const frame of sheet.frames) {
    assert.equal(
      frame.caption,
      `${ANGLE_LABELS[frame.angle]} · ${formatDateShort(frame.capturedAt)}`,
    );
  }
});

test('footer names the one day when every photograph shares it', () => {
  const sheet = build(sameDay);
  assert.equal(
    sheet.footer,
    `Photographs taken with Tress, on ${formatDate(SESSION_AT)}. No analysis or claim is attached.`,
  );
  assert.ok(!sheet.footer.includes('between'));
});

test('footer spans the days when the set does', () => {
  const sheet = build(extended);
  const times = extended.photos.map((p) => new Date(p.capturedAt).getTime());
  const earliest = new Date(Math.min(...times)).toISOString();
  const latest = new Date(Math.max(...times)).toISOString();

  assert.equal(
    sheet.footer,
    `Photographs taken with Tress between ${formatDate(earliest)} and ${formatDate(
      latest,
    )}. No analysis or claim is attached.`,
  );
  // The single-day sentence would be false of this set, so it is not used.
  assert.ok(!sheet.footer.includes(`, on ${formatDate(SESSION_AT)}`));
});

test('the baseline line names the baseline, and the baseline itself has none', () => {
  assert.equal(build(baseline).baselineLine, null);
  assert.equal(
    build(sameDay).baselineLine,
    `Baseline taken ${formatDate(JOURNEY_STARTED)}`,
  );
  // The baseline session was deleted: the journey's own start stands in.
  assert.equal(
    build(sameDay, null).baselineLine,
    `Baseline taken ${formatDate(JOURNEY_STARTED)}`,
  );
});

test('the heading is the milestone, never the name the person typed', () => {
  const named: PhotoSession = { ...sameDay, title: 'my regrowth diary' };
  const sheet = build(named);

  assert.equal(sheet.heading, formatMilestone(JOURNEY_STARTED, SESSION_AT, false));
  assert.ok(!sheetStrings(named).join(' ').includes('regrowth'));
});

test('the file name is the same day the sheet shows', () => {
  const sheet = build(sameDay);
  assert.equal(sheet.fileName, `Tress update ${toDateKey(new Date(SESSION_AT))}.jpg`);
  assert.match(sheet.fileName, /^Tress update \d{4}-\d{2}-\d{2}\.jpg$/);
});

test('every word on the image and in the sheet is honest', () => {
  assertHonest(assert, shareCopySentences(), 'share copy');
  for (const session of [sameDay, extended, baseline]) {
    assertHonest(assert, sheetStrings(session), 'share sheet');
  }

  for (const sentence of [...shareCopySentences(), ...sheetStrings(extended)]) {
    assert.ok(!FUNNEL.test(sentence), `share copy sells an outcome: ${sentence}`);
  }
});

test('nothing claims an outcome the share sheet cannot report', () => {
  // shareAsync resolves the same way whether the person sent the image or
  // cancelled, so no string may say it went anywhere.
  for (const value of Object.values(SHARE_COPY)) {
    assert.ok(
      !/\b(shared|sent|saved|delivered|success)\b/i.test(value),
      `share copy claims an outcome: ${value}`,
    );
  }
});

test('the accessibility label describes the whole image, in order', () => {
  const sheet = build(sameDay);
  const label = sheet.accessibilityLabel;

  let at = 0;
  for (const part of [
    sheet.heading,
    sheet.dateLine,
    `${sheet.frames.length} photographs`,
    ...sheet.frames.map((f) => f.caption),
    sheet.footer,
  ]) {
    const found = label.indexOf(part, at);
    assert.ok(found >= 0, `accessibility label is missing "${part}"`);
    at = found;
  }
});

test('a single photograph is not "1 photographs"', () => {
  assert.ok(build(baseline).accessibilityLabel.includes('1 photograph:'));
});

test('a session with no photographs builds rather than crashing', () => {
  const sheet = build({ ...sameDay, photos: [] });
  assert.equal(sheet.frames.length, 0);
  assert.equal(
    sheet.footer,
    `Photographs taken with Tress, on ${formatDate(SESSION_AT)}. No analysis or claim is attached.`,
  );
  assert.ok(sheet.accessibilityLabel.includes('0 photographs'));
});
