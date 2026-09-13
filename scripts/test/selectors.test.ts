/**
 * The logic the interface cannot show you is wrong.
 *
 * A streak, an adherence percentage and a month boundary all look like
 * plausible numbers whatever they say, so a screenshot proves nothing
 * about them. These build journeys with dates placed exactly where the
 * edge cases are and check what the selectors make of them.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { hairContent } from '@/features/content/hair-content';
import { productOptions } from '@/features/onboarding/products';
import {
  funnelContent,
  routineSeedsFor,
  STEPS,
  withName,
} from '@/features/onboarding/script';
import { formatMilestone, toDateKey } from '@/lib/date';
import { isProfilePhoto, profilePhotoName } from '@/lib/photo-names';
import {
  adherencePercent,
  dosesOn,
  longestStreak,
  routineItemStats,
  consistencyScore,
  currentStreak,
  dailyCompletion,
  monthlySessionCounts,
  todayProgress,
  weekProgress,
} from '@/store/selectors';
import {
  ANGLE_GUIDANCE,
  ANGLES,
  doseCount,
  dosesTaken,
  FREQUENCY_OPTIONS,
  weeklyTarget,
  EMPTY_DATA,
  SCHEMA_VERSION,
  type AppData,
  type RoutineItem,
} from '@/types/domain';

/* ------------------------------ fixtures ------------------------------- */

/** Midnight, `ago` days back, in the device's own timezone. */
function daysAgo(ago: number): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - ago);
}

function item(id: string, createdDaysAgo: number): RoutineItem {
  return {
    id,
    journeyId: 'j1',
    label: id,
    cadence: 'daily',
    createdAt: daysAgo(createdDaysAgo).toISOString(),
  };
}

/** A journey that started `startedDaysAgo` back, with the given items. */
function journeyWith(startedDaysAgo: number, items: RoutineItem[]): AppData {
  return {
    ...EMPTY_DATA,
    schemaVersion: SCHEMA_VERSION,
    profile: { id: 'p1', displayName: 'Test', createdAt: daysAgo(startedDaysAgo).toISOString() },
    journey: {
      id: 'j1',
      profileId: 'p1',
      startedAt: daysAgo(startedDaysAgo).toISOString(),
      trackingAreas: ['crown'],
      motivations: [],
      goal: 'fullness',
      triggers: [],
      approaches: [],
      updateIntervalDays: 30,
      createdAt: daysAgo(startedDaysAgo).toISOString(),
    },
    routineItems: items,
  };
}

/** Marks `itemId` done on each of the given days back from today. */
function completeOn(data: AppData, itemId: string, days: number[]): AppData {
  return {
    ...data,
    routineLogs: [
      ...data.routineLogs,
      ...days.map((d) => ({
        id: `log_${itemId}_${d}`,
        routineItemId: itemId,
        date: toDateKey(daysAgo(d)),
        completed: true,
        loggedAt: daysAgo(d).toISOString(),
      })),
    ],
  };
}

/** An item taken `doses` times a day. */
function multiDose(id: string, createdDaysAgo: number, doses: number): RoutineItem {
  return { ...item(id, createdDaysAgo), dosesPerDay: doses };
}

/** Records `doses` of `itemId` on the given day, out of `total`. */
function takeDoses(
  data: AppData,
  itemId: string,
  day: number,
  doses: number,
  total: number,
): AppData {
  return {
    ...data,
    routineLogs: [
      ...data.routineLogs,
      {
        id: `log_${itemId}_${day}`,
        routineItemId: itemId,
        date: toDateKey(daysAgo(day)),
        doses,
        completed: doses >= total,
        loggedAt: daysAgo(day).toISOString(),
      },
    ],
  };
}

/* -------------------------------- funnel -------------------------------- */

test('funnel: who you are is asked before anything about hair', () => {
  // Everything after it is drawn from the answer, so it cannot come later.
  assert.ok(STEPS.indexOf('you') < STEPS.indexOf('meaning'));
  assert.ok(STEPS.indexOf('you') < STEPS.indexOf('goal'));
  assert.ok(STEPS.indexOf('you') < STEPS.indexOf('story'));
  assert.ok(STEPS.indexOf('you') < STEPS.indexOf('medication'));
  assert.equal(STEPS.indexOf('you'), 1, 'it follows the welcome and nothing else');
});

test('funnel: the question sets actually differ', () => {
  const male = funnelContent('male');
  const female = funnelContent('female');

  const values = (list: { value: string }[]) => list.map((c) => c.value).join();
  assert.notEqual(values(male.goals), values(female.goals));
  assert.notEqual(values(male.areas), values(female.areas));
  assert.notEqual(values(male.triggers), values(female.triggers));
  assert.notEqual(values(male.medications), values(female.medications));
});

test('funnel: the female set asks about hair a woman has', () => {
  const female = funnelContent('female');
  const areas = female.areas.map((c) => c.value);

  assert.ok(areas.includes('widerPart'));
  assert.ok(areas.includes('ponytail'));
  assert.ok(
    !areas.includes('hairline'),
    'a receding hairline is a male pattern question',
  );
  assert.ok(
    female.medications.some((m) => m.value === 'spironolactone'),
    'commonly prescribed to women, and missing from the list they see',
  );
  assert.ok(
    !female.medications.some((m) => m.value === 'dutasteride'),
    'very rarely given to women; "something else" covers it',
  );
});

test('funnel: the male set is untouched', () => {
  const male = funnelContent('male');
  assert.deepEqual(
    male.areas.map((c) => c.value),
    ['hairline', 'crown', 'overallThinning', 'shedding', 'density', 'generalChanges'],
  );
  assert.ok(male.medications.some((m) => m.value === 'dutasteride'));
});

test('funnel: a name goes into the heading, and its absence leaves no scar', () => {
  const line = 'What would better hair mean to you{name}?';
  assert.equal(withName(line, 'Arslan'), 'What would better hair mean to you, Arslan?');
  assert.equal(withName(line, '  '), 'What would better hair mean to you?');
  assert.equal(
    withName('Imagine six months from now{name}.', 'Sara'),
    'Imagine six months from now, Sara.',
  );
});

/* ----------------------------- reference set ---------------------------- */

test('content: a profile with no gender gets the set the app shipped with', () => {
  assert.deepEqual(hairContent(undefined), hairContent('male'));
});

test('content: every angle has an example and words of its own', () => {
  for (const gender of ['male', 'female'] as const) {
    const content = hairContent(gender);
    for (const angle of ANGLES) {
      const item = content.angles[angle];
      assert.ok(item.example, `${gender}/${angle} has no example image`);
      assert.ok(item.instruction.length > 0, `${gender}/${angle} has no instruction`);
      assert.ok(item.tips.length > 0, `${gender}/${angle} has no tips`);
    }
    assert.ok(content.portrait, `${gender} has no portrait`);
    assert.ok(content.progress.before && content.progress.after);
  }
});

test('content: the two sets share no image', () => {
  // A single shared require would mean one of them is showing the other's
  // reference photograph, which is the whole failure this exists to avoid.
  const male = hairContent('male');
  const female = hairContent('female');

  const ids = (c: ReturnType<typeof hairContent>) => [
    c.portrait,
    c.progress.before,
    c.progress.after,
    ...ANGLES.map((a) => c.angles[a].example),
  ];

  const overlap = ids(male).filter((id) => ids(female).includes(id));
  assert.deepEqual(overlap, [], 'the male and female sets share an image');
});

test('content: the male wording is still the wording it shipped with', () => {
  const male = hairContent('male');
  for (const angle of ANGLES) {
    assert.equal(
      male.angles[angle].instruction,
      ANGLE_GUIDANCE[angle].instruction,
      `${angle} drifted from the guidance it shipped with`,
    );
    assert.deepEqual(male.angles[angle].tips, ANGLE_GUIDANCE[angle].tips);
  }
});

test('content: the female wording differs, and claims nothing medical', () => {
  const female = hairContent('female');
  const banned = /diagnos|detect|treat|cure|regrow|restore your hair|loss is/i;

  let differences = 0;
  for (const angle of ANGLES) {
    const line = female.angles[angle].instruction;
    assert.ok(!banned.test(line), `${angle}: "${line}" reads as a medical claim`);
    if (line !== ANGLE_GUIDANCE[angle].instruction) differences += 1;
  }
  assert.ok(differences > 0, 'the female set is just a copy of the male one');
});

/* -------------------------------- stack --------------------------------- */

test('stack: products carry their frequency into the seeds', () => {
  const seeds = routineSeedsFor({
    approaches: [],
    products: [
      { label: 'Shampoo', icon: 'drop', timeOfDay: 'anytime', timesPerWeek: 2 },
      { label: 'Scalp serum', icon: 'dropper', timeOfDay: 'anytime', timesPerWeek: 7 },
    ],
  });

  assert.deepEqual(
    seeds.map((s) => [s.label, s.timesPerWeek]),
    [['Shampoo', 2], ['Scalp serum', 7]],
  );
});

test('stack: treatments come before hair care', () => {
  // What somebody is anxious to keep up should be the first row each
  // morning, not below the conditioner.
  const seeds = routineSeedsFor({
    approaches: [],
    medications: ['finasterideOral'],
    products: [{ label: 'Shampoo', icon: 'drop', timeOfDay: 'anytime', timesPerWeek: 2 }],
  });

  assert.deepEqual(seeds.map((s) => s.label), ['Finasteride (oral)', 'Shampoo']);
});

test('stack: the product lists differ and every default is a real frequency', () => {
  const male = productOptions('male');
  const female = productOptions('female');

  assert.notDeepEqual(male.map((p) => p.id), female.map((p) => p.id));
  assert.ok(female.length > male.length, 'the female routine is usually longer');

  for (const option of [...male, ...female]) {
    assert.ok(
      FREQUENCY_OPTIONS.includes(option.defaultTimesPerWeek as never),
      `${option.id} defaults to a frequency the picker cannot show`,
    );
  }
});

/* ------------------------------ frequency ------------------------------- */

/** An item done `times` a week rather than every day. */
function weekly(id: string, createdDaysAgo: number, times: number): RoutineItem {
  return { ...item(id, createdDaysAgo), cadence: 'weekly', timesPerWeek: times };
}

test('frequency: anything without one is daily, as everything used to be', () => {
  assert.equal(weeklyTarget(item('a', 0)), 7);
  assert.equal(weeklyTarget({ cadence: 'daily' }), 7);
  assert.equal(weeklyTarget({ cadence: 'weekly', timesPerWeek: 2 }), 2);
  // A weekly item with no count is once; nonsense is clamped, not trusted.
  assert.equal(weeklyTarget({ cadence: 'weekly' }), 1);
  assert.equal(weeklyTarget({ cadence: 'weekly', timesPerWeek: 99 }), 6);
  assert.equal(weeklyTarget({ cadence: 'weekly', timesPerWeek: 0 }), 1);
});

test('frequency: a weekly item never breaks the daily streak', () => {
  // Shampoo twice a week, alongside something daily that is being kept.
  let data = journeyWith(10, [item('daily', 10), weekly('shampoo', 10, 2)]);
  data = completeOn(data, 'daily', [0, 1, 2]);

  assert.equal(
    currentStreak(data),
    3,
    'the five days shampoo was never due are not days it was missed',
  );
});

test('frequency: a routine of only weekly items has no daily streak to give', () => {
  const data = completeOn(journeyWith(10, [weekly('a', 10, 2)]), 'a', [0, 1]);
  assert.equal(currentStreak(data), 0, 'there is no day it could have completed');
});

test('frequency: adherence expects a weekly item only as often as it is due', () => {
  // Once a week for four weeks, done every time: kept perfectly.
  const days = [0, 7, 14, 21];
  const data = completeOn(journeyWith(27, [weekly('a', 27, 1)]), 'a', days);

  const kept = adherencePercent(data, 28);
  assert.ok(
    kept !== null && kept >= 95,
    `once a week, done every week, should read as kept — got ${kept}`,
  );
});

test('frequency: a daily-only routine reads exactly as it did before', () => {
  // The regression that matters: weighting must reduce to the old sum.
  const data = completeOn(journeyWith(3, [item('a', 3)]), 'a', [0, 2]);
  assert.equal(adherencePercent(data), 50);
});

/* -------------------------------- doses --------------------------------- */

test('doses: an item without a count is taken once a day', () => {
  assert.equal(doseCount(item('a', 0)), 1);
  assert.equal(doseCount({ dosesPerDay: undefined }), 1);
});

test('doses: the count is clamped to something a day can hold', () => {
  assert.equal(doseCount({ dosesPerDay: 0 }), 1);
  assert.equal(doseCount({ dosesPerDay: -3 }), 1);
  assert.equal(doseCount({ dosesPerDay: 99 }), 4);
  assert.equal(doseCount({ dosesPerDay: Number.NaN }), 1);
});

test('doses: a log from before doses existed still reads as complete', () => {
  // The shape every log on disk has today: completed, with no count.
  assert.equal(dosesTaken({ completed: true }, 2), 2);
  assert.equal(dosesTaken({ completed: false }, 2), 0);
  assert.equal(dosesTaken(undefined, 2), 0);
});

test('doses: a count is never read back higher than the item allows', () => {
  // Someone drops a topical from twice a day to once after taking both.
  assert.equal(dosesTaken({ completed: true, doses: 2 }, 1), 1);
});

test('doses: half a twice-daily item is not a completed day', () => {
  const base = journeyWith(10, [multiDose('a', 10, 2)]);

  const half = takeDoses(base, 'a', 0, 1, 2);
  assert.equal(currentStreak(half), 0, 'one of two doses is not the day done');

  const full = takeDoses(base, 'a', 0, 2, 2);
  assert.equal(currentStreak(full), 1);
});

test('doses: today is counted in doses, not in items', () => {
  let data = journeyWith(10, [multiDose('a', 10, 2), item('b', 10)]);
  data = takeDoses(data, 'a', 0, 1, 2);

  assert.deepEqual(
    todayProgress(data),
    { done: 1, total: 3 },
    'one of three doses, not one of two items',
  );

  data = takeDoses(data, 'b', 0, 1, 1);
  assert.deepEqual(todayProgress(data), { done: 2, total: 3 });
});

test('doses: dosesOn reports what is in for each item', () => {
  let data = journeyWith(10, [multiDose('a', 10, 3), item('b', 10)]);
  data = takeDoses(data, 'a', 0, 2, 3);

  const taken = dosesOn(data, toDateKey());
  assert.equal(taken.get('a'), 2);
  assert.equal(taken.get('b'), undefined, 'nothing logged is nothing taken');
});

test('doses: a part-done day does not count toward adherence', () => {
  // Adherence and streak both turn on whole items, so half a dose
  // schedule must not read as half a day kept.
  const base = journeyWith(1, [multiDose('a', 1, 2)]);
  const half = takeDoses(base, 'a', 0, 1, 2);

  assert.equal(adherencePercent(half), 0);
  assert.equal(adherencePercent(takeDoses(base, 'a', 0, 2, 2)), 50, 'one of the two days');
});

/* ------------------------------- streak -------------------------------- */

test('streak: one item finished today is a streak of one', () => {
  const data = completeOn(journeyWith(10, [item('a', 10)]), 'a', [0]);
  assert.equal(currentStreak(data), 1);
});

test('streak: today and yesterday is a streak of two', () => {
  const data = completeOn(journeyWith(10, [item('a', 10)]), 'a', [0, 1]);
  assert.equal(currentStreak(data), 2);
});

test('streak: a missed day ends the run', () => {
  // Done today, yesterday, then a gap, then two more.
  const data = completeOn(journeyWith(10, [item('a', 10)]), 'a', [0, 1, 3, 4]);
  assert.equal(currentStreak(data), 2);
});

test('streak: an unfinished today does not break yesterday’s run', () => {
  // Nothing yet today; the day is not over.
  const data = completeOn(journeyWith(10, [item('a', 10)]), 'a', [1, 2, 3]);
  assert.equal(currentStreak(data), 3);
});

test('streak: every item must be done, not just one', () => {
  const base = journeyWith(10, [item('a', 10), item('b', 10)]);
  const partial = completeOn(base, 'a', [0, 1]);
  assert.equal(currentStreak(partial), 0, 'one of two items is not a completed day');

  const full = completeOn(partial, 'b', [0, 1]);
  assert.equal(currentStreak(full), 2);
});

test('streak: a duplicate log for the same day counts once', () => {
  let data = completeOn(journeyWith(10, [item('a', 10)]), 'a', [0]);
  data = { ...data, routineLogs: [...data.routineLogs, { ...data.routineLogs[0], id: 'dupe' }] };
  assert.equal(currentStreak(data), 1);
});

test('streak: an item added today cannot manufacture yesterday', () => {
  const data = completeOn(journeyWith(10, [item('new', 0)]), 'new', [0]);
  assert.equal(currentStreak(data), 1);
});

/* ----------------------------- adherence ------------------------------- */

test('adherence: no routine items has no percentage to report', () => {
  assert.equal(adherencePercent(journeyWith(10, [])), null);
});

test('adherence: days before the journey began are not counted as missed', () => {
  // Started yesterday, both days done: two of two, not two of thirty.
  const data = completeOn(journeyWith(1, [item('a', 1)]), 'a', [0, 1]);
  assert.equal(adherencePercent(data), 100);
});

test('adherence: half the days done reads as half', () => {
  const data = completeOn(journeyWith(3, [item('a', 3)]), 'a', [0, 2]);
  // Four days exist (today plus three); two are done.
  assert.equal(adherencePercent(data), 50);
});

test('adherence: an item cannot be missed before it existed', () => {
  const data = completeOn(journeyWith(10, [item('late', 1)]), 'late', [0, 1]);
  assert.equal(adherencePercent(data), 100);
});

/* ---------------------------- today / week ----------------------------- */

test('today: counts only what is done today', () => {
  const data = completeOn(journeyWith(5, [item('a', 5), item('b', 5)]), 'a', [0]);
  assert.deepEqual(todayProgress(data), { done: 1, total: 2 });
});

test('week: the grid is seven days and today is inside it', () => {
  const week = weekProgress(completeOn(journeyWith(30, [item('a', 30)]), 'a', [0]));
  assert.equal(week.days.length, 7);
  assert.ok(week.days.some((d) => d.date === toDateKey()), 'today is in this week');
  assert.equal(week.days.find((d) => d.date === toDateKey())?.done, true);
});

/* --------------------------- daily completion -------------------------- */

test('daily completion: the last cell is today, and it is marked', () => {
  const cells = dailyCompletion(completeOn(journeyWith(30, [item('a', 30)]), 'a', [0]), 28);
  assert.equal(cells.length, 28);
  assert.equal(cells[cells.length - 1].isToday, true);
  assert.equal(cells[cells.length - 1].value, 1);
});

test('daily completion: days before the journey report nothing, not zero', () => {
  const cells = dailyCompletion(journeyWith(2, [item('a', 2)]), 28);
  assert.equal(cells[0].value, null, 'a day before the journey has no score to give');
});

/* ----------------------------- month edges ----------------------------- */

test('monthly sessions: a session lands in its own calendar month', () => {
  const now = new Date();
  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1, 12);
  const lastOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 12);

  const data: AppData = {
    ...journeyWith(200, [item('a', 200)]),
    sessions: [
      {
        id: 's1',
        journeyId: 'j1',
        capturedAt: firstOfThisMonth.toISOString(),
        isBaseline: true,
        photos: [],
      },
      {
        id: 's2',
        journeyId: 'j1',
        capturedAt: lastOfLastMonth.toISOString(),
        isBaseline: false,
        photos: [],
      },
    ],
  };

  const months = monthlySessionCounts(data, 6);
  assert.equal(months[months.length - 1].value, 1, 'this month holds one');
  assert.equal(months[months.length - 2].value, 1, 'last month holds the other');
});

/* ------------------------------ milestones ----------------------------- */

test('milestone: only the baseline session is called Baseline', () => {
  const start = daysAgo(0).toISOString();

  assert.equal(formatMilestone(start, start, true), 'Baseline');
  assert.equal(
    formatMilestone(start, start, false),
    'Day 1',
    'a second set taken the same day is not the baseline',
  );
});

test('milestone: two sessions never carry the same label on one comparison', () => {
  // The exact case that put "Baseline → Baseline" on the progress card.
  const start = daysAgo(0).toISOString();
  const before = formatMilestone(start, start, true);
  const after = formatMilestone(start, start, false);
  assert.notEqual(before, after);
});

test('milestone: later sessions read in weeks, months and years', () => {
  const start = daysAgo(400).toISOString();
  assert.equal(formatMilestone(start, daysAgo(397).toISOString(), false), 'Day 4');
  assert.equal(formatMilestone(start, daysAgo(390).toISOString(), false), 'Week 1');
  assert.equal(formatMilestone(start, daysAgo(280).toISOString(), false), 'Month 3');
  assert.equal(formatMilestone(start, daysAgo(35).toISOString(), false), 'Year 1');
});

/* --------------------------- portrait deletion ------------------------- */

/**
 * The guard on a file delete. A session frame is the one thing in the photo
 * directory the user cannot retake, so this is tested as a whitelist: if it
 * ever answers true for a capture, that capture gets deleted.
 */
test('portraits: only our own card portraits are deletable', () => {
  const dir = 'file:///data/Documents/photos/';

  assert.equal(isProfilePhoto(`${dir}profile_1700000000000.jpg`), true);
  assert.equal(isProfilePhoto(`${dir}profile.jpg`), true, 'the pre-timestamp name');

  // Whatever the writer produces, the guard must recognise it back.
  assert.equal(isProfilePhoto(dir + profilePhotoName()), true);
});

test('portraits: two portraits written apart do not share a name', () => {
  // The point of the timestamp: same path plus different bytes is exactly
  // what an image cache cannot see, and the card kept the replaced photo.
  assert.notEqual(profilePhotoName(1), profilePhotoName(2));
});

test('portraits: a session frame is never deletable', () => {
  const dir = 'file:///data/Documents/photos/';

  for (const name of [
    'ses_abc123_crown.jpg',
    'ses_abc123_crown_thumb.jpg',
    'ses_profile_crown.jpg',
    'baseline_hairline.jpg',
    'myprofile_1700000000000.jpg',
  ]) {
    assert.equal(
      isProfilePhoto(dir + name),
      false,
      `${name} is not a card portrait and must survive`,
    );
  }
});

/* ---------------------------- routine seeding -------------------------- */

test('seeds: approaches alone still build the stack they always did', () => {
  const seeds = routineSeedsFor({ approaches: ['topical', 'supplements'] });
  assert.deepEqual(
    seeds.map((s) => s.label),
    ['Topical treatment', 'Supplements'],
  );
});

test('seeds: a named treatment replaces the generic row for its category', () => {
  const seeds = routineSeedsFor({
    approaches: ['topical', 'haircare'],
    medications: ['minoxidilTopical'],
  });
  assert.deepEqual(
    seeds.map((s) => s.label),
    ['Minoxidil (topical)', 'Hair-care routine'],
    'the topical seed steps aside; hair-care is untouched',
  );
});

test('seeds: an uncovered approach keeps its generic row', () => {
  const seeds = routineSeedsFor({
    approaches: ['topical', 'supplements'],
    medications: ['finasterideOral'],
  });
  assert.deepEqual(
    seeds.map((s) => s.label),
    ['Finasteride (oral)', 'Topical treatment', 'Supplements'],
    'finasteride covers prescription, which was never selected',
  );
});

test('seeds: no named treatment is ever given a time of day', () => {
  const seeds = routineSeedsFor({
    approaches: [],
    medications: ['minoxidilTopical', 'finasterideOral', 'dutasteride', 'ketoconazole'],
  });
  assert.equal(seeds.length, 4);
  for (const seed of seeds) {
    assert.equal(
      seed.timeOfDay,
      'anytime',
      `${seed.label} must not carry a schedule the app invented`,
    );
  }
});

test('seeds: "nothing right now" puts nothing in the stack', () => {
  const seeds = routineSeedsFor({ approaches: [], medications: ['none'] });
  assert.deepEqual(seeds, []);
});

test('seeds: a typed treatment goes in under its own name', () => {
  const seeds = routineSeedsFor({
    approaches: [],
    medications: ['other'],
    medicationNote: '  Rosemary oil  ',
  });
  assert.deepEqual(
    seeds.map((s) => s.label),
    ['Rosemary oil'],
  );
  assert.equal(seeds[0].timeOfDay, 'anytime');
});

test('seeds: "something else" with nothing typed adds no empty row', () => {
  const seeds = routineSeedsFor({
    approaches: [],
    medications: ['other'],
    medicationNote: '   ',
  });
  assert.deepEqual(seeds, []);
});

test('seeds: an unanswered medication question changes nothing', () => {
  // Journeys created before the question existed, and anyone who skipped it.
  const before = routineSeedsFor({ approaches: ['prescription'] });
  const after = routineSeedsFor({ approaches: ['prescription'], medications: [] });
  assert.deepEqual(before, after);
  assert.deepEqual(
    before.map((s) => s.label),
    ['Prescription medication'],
  );
});

/* --------------------------- per-item history --------------------------- */

test('item stats: counts the days it existed and the days it was done', () => {
  const data = completeOn(journeyWith(10, [item('a', 5)]), 'a', [0, 1, 2]);
  const [stat] = routineItemStats(data);

  assert.equal(stat.daysTracked, 6, 'added five days ago, counting today');
  assert.equal(stat.daysDone, 3);
  assert.equal(stat.streak, 3);
  assert.equal(stat.adherence, 50, 'three of the six days it has existed');
});

test('item stats: an unfinished today is not counted against it', () => {
  // Done yesterday and the day before, nothing yet today.
  const data = completeOn(journeyWith(10, [item('a', 5)]), 'a', [1, 2]);
  const [stat] = routineItemStats(data);

  assert.equal(stat.streak, 2, 'the run survives a day that is not over');
  assert.equal(
    stat.adherence,
    40,
    'two of the five days that have finished, not two of six',
  );
});

test('item stats: something added today reports no percentage yet', () => {
  const [stat] = routineItemStats(journeyWith(10, [item('a', 0)]));

  assert.equal(stat.daysTracked, 1);
  assert.equal(stat.streak, 0);
  assert.equal(
    stat.adherence,
    null,
    'a bare 0% on the day you start reads as a failure it has not earned',
  );
});

test('item stats: a gap ends that item\'s run but not its total', () => {
  const data = completeOn(journeyWith(20, [item('a', 9)]), 'a', [0, 1, 3, 4]);
  const [stat] = routineItemStats(data);

  assert.equal(stat.streak, 2);
  assert.equal(stat.daysDone, 4);
});

test('item stats: each item is scored on its own history', () => {
  let data = journeyWith(30, [item('old', 20), item('new', 2)]);
  data = completeOn(data, 'old', [0]);
  data = completeOn(data, 'new', [0, 1, 2]);

  const stats = routineItemStats(data);
  assert.deepEqual(
    stats.map((s) => s.item.id),
    ['old', 'new'],
    'oldest first, so the list reads as the order things were taken up',
  );

  const [old, fresh] = stats;
  assert.equal(old.daysTracked, 21);
  assert.equal(old.daysDone, 1);
  assert.equal(fresh.daysTracked, 3);
  assert.equal(fresh.daysDone, 3);
  assert.equal(fresh.adherence, 100, 'the newer item is not dragged down by the older');
});

test('item stats: a day logged before the item existed does not count', () => {
  // Should not happen, but the store is a plain object on disk.
  const data = completeOn(journeyWith(30, [item('a', 2)]), 'a', [0, 10]);
  const [stat] = routineItemStats(data);

  assert.equal(stat.daysDone, 1, 'only the day inside its own lifetime');
});

/* ------------------------------ longest run ----------------------------- */

test('longest streak: the best complete run, not the current one', () => {
  // Three in a row a while back, nothing since.
  const data = completeOn(journeyWith(5, [item('a', 5)]), 'a', [1, 2, 3]);

  assert.equal(longestStreak(data), 3);
  assert.equal(currentStreak(data), 3, 'still running: today is not over');
});

/* --------------------------- consistency delta ------------------------- */

test('consistency delta: compares this month against the one before it', () => {
  // Perfect for the last 30 days, nothing at all in the 30 before that.
  const recent = Array.from({ length: 30 }, (_, i) => i);
  const data = completeOn(journeyWith(59, [item('a', 59)]), 'a', recent);

  const score = consistencyScore(data);
  const delta = score.delta;
  assert.ok(delta !== null, 'there are two windows to compare');
  assert.ok(
    delta > 0,
    `a month of perfect adherence after a month of none must read as a gain, got ${delta}`,
  );

  // The card labels this "vs last month". Last month was nothing at all,
  // so the routine half of the score moved the whole way: 100 points of
  // adherence at its 0.6 weighting.
  assert.equal(
    delta,
    60,
    `"vs last month" must compare against the previous month alone, got ${delta}`,
  );
});
