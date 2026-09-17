/**
 * The processing pass has bars on screen, and a bar is a promise about
 * work. These tests hold it to that promise on a machine with no camera
 * and no model: the bars only move when a unit has finished, the floors
 * hold a reading on screen without ever running ahead of it, a unit that
 * never answers hits its ceiling rather than stalling the screen, and a
 * build without the segmenter says so instead of filling a bar over
 * nothing.
 *
 * Time is Node's mocked clock, so the floors are asserted to the
 * millisecond rather than "about right".
 */

import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';

import './expo-globals';
import type { PhotoAnalysis } from '@/features/assessment/analyse-photo';
import type { PhotoMeasurement } from '@/features/assessment/hair-segmenter';
import {
  ANALYSIS_COPY,
  ANALYSIS_PACING,
  BUILD_BAR_CREEP_RATIO,
  BUILD_BAR_WORK_SHARE,
  HANDOFF_HOLD_MS,
  ORBIT_ABSORB_PULSE_MS,
  ORBIT_ABSORB_SETTLE_MS,
  ORBIT_FRAME_MAX,
  ORBIT_FRAME_MIN,
  ORBIT_SETTLE_HOLD_MS,
  absorbBeats,
  absorbFloorMs,
  absorbHandoffMs,
  analysisCopySentences,
  buildBarTarget,
  handoffSchedule,
  measuredFrameCount,
  orbitAbsorbMs,
  orbitConvergeMs,
  orbitFrameSize,
  orbitPositions,
  orbitReadyMs,
  orbitSettleMs,
  orderFrames,
  pickMainFrame,
  planAnalysis,
  runAnalysis,
  toPhotoReadings,
  type AnalysisDeps,
  type AnalysisFrame,
  type AnalysisProgress,
} from '@/features/hair-scan/analysis';
import { HAIR_SCAN_COPY } from '@/features/hair-scan/copy';

import { assertHonest } from './honesty-words';

/* ------------------------------ fixtures ------------------------------ */

const FRAMES: AnalysisFrame[] = [
  { id: 'a', angle: 'leftTemple', uri: 'file:///scan/a.jpg' },
  { id: 'b', angle: 'front', uri: 'file:///scan/b.jpg' },
  { id: 'c', angle: 'rightTemple', uri: 'file:///scan/c.jpg' },
];

const QUALITY: PhotoAnalysis = {
  quality: { brightness: 120, contrast: 40, sharpness: 12, clipped: 0.01, issues: [] },
  comparability: null,
};

const AREA: PhotoMeasurement = {
  coverage: { fraction: 0.3, upperFraction: 0.5, verticalBalance: 0.7, horizontalBalance: 0.5, pixels: 1000 },
  maskTrace: { contours: ['0,0 1,0 1,1'], topEdge: [], cells: '', tolerance: 2 },
};

/** A measurement that answers after `ms` on the mocked clock. */
function after<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function deps(overrides: Partial<AnalysisDeps> = {}): AnalysisDeps {
  return {
    analysePhoto: async () => QUALITY,
    measureCoverage: async () => AREA,
    ...overrides,
  };
}

/**
 * Runs the pass under the mocked clock, ticking it forward until the
 * promise settles. `setImmediate` is left real so each step drains every
 * microtask the runner's own awaits queue.
 */
async function drive<T>(t: TestContext, work: () => Promise<T>, step = 50): Promise<T> {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  let settled = false;
  let value: T | undefined;
  let failure: unknown;
  const promise = work().then(
    (v) => {
      settled = true;
      value = v;
    },
    (e) => {
      settled = true;
      failure = e;
    },
  );

  const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
  let ticked = 0;
  while (!settled) {
    await flush();
    if (settled) break;
    t.mock.timers.tick(step);
    ticked += step;
    if (ticked > 120_000) throw new Error('the pass did not finish on the mocked clock');
  }
  await promise;
  if (failure !== undefined) throw failure;
  return value as T;
}

/** The progress events, each stamped with the mocked clock. */
function recorder() {
  const events: (AnalysisProgress & { at: number })[] = [];
  return {
    events,
    onProgress: (p: AnalysisProgress) => {
      events.push({ ...p, at: Date.now() });
    },
  };
}

/* -------------------------------- plan -------------------------------- */

test('plan: the front frame leads and is the main one', () => {
  assert.equal(pickMainFrame(FRAMES)?.id, 'b');
  assert.deepEqual(
    orderFrames(FRAMES).map((f) => f.id),
    ['b', 'a', 'c'],
  );
  // Without a front frame the first captured one stands in.
  const noFront = FRAMES.filter((f) => f.angle !== 'front');
  assert.equal(pickMainFrame(noFront)?.id, 'a');
  assert.equal(pickMainFrame([]), null);
  // The engine hands over ring regions before the mapper resolves angles;
  // the front region leads just the same.
  const byRegion: AnalysisFrame[] = [
    { id: 'x', uri: 'file:///x.jpg', region: 'left' },
    { id: 'y', uri: 'file:///y.jpg', region: 'front' },
  ];
  assert.equal(pickMainFrame(byRegion)?.id, 'y');
  assert.equal(planAnalysis(byRegion, true).units.find((u) => u.kind === 'area')?.frameId, 'y');
});

test('plan: the lines the pass shows are the scan copy\'s own processing lines', () => {
  // Two vocabularies, one set of words: every label a unit can carry is
  // in the copy lane's list, so a rename there fails here rather than
  // drifting on screen.
  const stages: readonly string[] = HAIR_SCAN_COPY.processing.stages;
  for (const line of [...Object.values(ANALYSIS_COPY.phase), ...Object.values(ANALYSIS_COPY.unit)]) {
    assert.ok(stages.includes(line), `"${line}" is not in HAIR_SCAN_COPY.processing.stages`);
  }
});

test('readings: a measurement becomes the record\'s optional fields, never a default', () => {
  const measured = toPhotoReadings({
    id: 'a', uri: 'file:///a.jpg', angle: 'front',
    quality: QUALITY.quality, coverage: AREA.coverage, maskTrace: AREA.maskTrace, area: 'measured',
  });
  assert.deepEqual(measured.quality, QUALITY.quality);
  assert.deepEqual(measured.coverage, AREA.coverage);
  assert.deepEqual(measured.maskTrace, AREA.maskTrace);

  const unread = toPhotoReadings({
    id: 'b', uri: 'file:///b.jpg', quality: null, coverage: null, maskTrace: null, area: 'unavailable',
  });
  assert.equal(unread.quality, undefined);
  assert.equal(unread.coverage, undefined);
  assert.equal(unread.maskTrace, undefined);
  assert.ok(!('area' in unread), 'the status is not a field on the record');
});

test('plan: with the segmenter, quality then area for every frame, then compose', () => {
  const plan = planAnalysis(FRAMES, true);
  assert.deepEqual(
    plan.units.map((u) => `${u.kind}:${u.frameId ?? '-'}`),
    ['quality:b', 'quality:a', 'quality:c', 'area:b', 'area:a', 'area:c', 'compose:-'],
  );
  assert.equal(plan.phases.analyse.units, 3);
  assert.equal(plan.phases.build.units, 4);
  assert.equal(plan.note, null);

  // Every line is tied to a unit that will actually run.
  const labels = new Set(plan.units.map((u) => u.label));
  for (const line of Object.values(ANALYSIS_COPY.unit)) {
    assert.ok(labels.has(line), `"${line}" is shown for no unit`);
  }
  // The hairline line is the front frame's area unit and nothing else's.
  const hairline = plan.units.filter((u) => u.label === ANALYSIS_COPY.unit.hairline);
  assert.deepEqual(hairline.map((u) => u.frameId), ['b']);
});

test('plan: without the segmenter the area units are absent and the note says so', () => {
  const plan = planAnalysis(FRAMES, false);
  assert.deepEqual(
    plan.units.map((u) => u.kind),
    ['quality', 'quality', 'quality', 'compose'],
  );
  assert.equal(plan.phases.build.units, 1);
  assert.equal(plan.note, ANALYSIS_COPY.areaUnavailable);
  const labels = plan.units.map((u) => u.label);
  assert.ok(!labels.includes(ANALYSIS_COPY.unit.hairline));
  assert.ok(!labels.includes(ANALYSIS_COPY.unit.coverage));
});

test('plan: no frames still plans the compose unit rather than nothing', () => {
  const plan = planAnalysis([], true);
  assert.deepEqual(plan.units.map((u) => u.kind), ['compose']);
});

/* ------------------------------- pacing ------------------------------- */

test('pacing: a fast phone is held to the unit floor and the total floor', async (t) => {
  const rec = recorder();
  const result = await drive(t, () => runAnalysis(FRAMES, { deps: deps(), onProgress: rec.onProgress }));

  // 7 units × 350 = 2450 > 2400, so the unit floors set the length here.
  assert.ok(result.elapsedMs >= 7 * ANALYSIS_PACING.unitFloorMs, `elapsed ${result.elapsedMs}`);
  assert.ok(result.elapsedMs >= ANALYSIS_PACING.totalFloorMs);

  // Each unit's finish is at least the floor after its start.
  const starts = rec.events.filter((e, i) => i % 2 === 0 && !e.finished);
  const ends = rec.events.filter((e, i) => i % 2 === 1 && !e.finished);
  assert.equal(starts.length, 7);
  assert.equal(ends.length, 7);
  for (let i = 0; i < starts.length; i += 1) {
    assert.ok(
      ends[i].at - starts[i].at >= ANALYSIS_PACING.unitFloorMs,
      `unit ${i} showed for ${ends[i].at - starts[i].at}ms`,
    );
  }
});

test('pacing: two frames without a model is shorter than the total floor, so the floor holds it', async (t) => {
  const rec = recorder();
  const result = await drive(t, () =>
    runAnalysis(FRAMES.slice(0, 2), {
      deps: deps({ measureCoverage: null }),
      onProgress: rec.onProgress,
    }),
  );
  // 3 units × 350 = 1050, so the total floor is what the person sees.
  assert.ok(result.elapsedMs >= ANALYSIS_PACING.totalFloorMs, `elapsed ${result.elapsedMs}`);
  assert.ok(result.elapsedMs < ANALYSIS_PACING.totalFloorMs + 100, `elapsed ${result.elapsedMs}`);
  const last = rec.events[rec.events.length - 1];
  assert.equal(last.finished, true);
  assert.ok(last.at - rec.events[0].at >= ANALYSIS_PACING.totalFloorMs);
});

test('pacing: a slow reading is waited for, and the floor is not added on top', async (t) => {
  const rec = recorder();
  await drive(t, () =>
    runAnalysis(FRAMES, {
      deps: deps({
        analysePhoto: (uri) => (uri.endsWith('b.jpg') ? after(900, QUALITY) : Promise.resolve(QUALITY)),
      }),
      onProgress: rec.onProgress,
    }),
  );
  const [start, end] = rec.events;
  assert.equal(start.unit.frameId, 'b');
  const shown = end.at - start.at;
  assert.ok(shown >= 900, `the slow unit ended after ${shown}ms`);
  assert.ok(shown < 900 + 100, `the floor was stacked on the slow unit: ${shown}ms`);
});

test('pacing: bars only advance on finished work, and finish before the next bar starts', async (t) => {
  const rec = recorder();
  await drive(t, () => runAnalysis(FRAMES, { deps: deps(), onProgress: rec.onProgress }));

  let lastAnalyse = 0;
  let lastBuild = 0;
  let lastDone = 0;
  for (const e of rec.events) {
    assert.ok(e.fraction.analyse >= lastAnalyse, 'the first bar went backwards');
    assert.ok(e.fraction.build >= lastBuild, 'the second bar went backwards');
    assert.ok(e.done >= lastDone);
    if (e.fraction.build > 0) assert.equal(e.fraction.analyse, 1, 'the second bar moved before the first was full');
    // A start event carries the same count as the end before it: nothing
    // advances on a unit that has merely begun.
    lastAnalyse = e.fraction.analyse;
    lastBuild = e.fraction.build;
    lastDone = e.done;
  }
  const finished = rec.events.filter((e) => e.finished);
  assert.equal(finished.length, 1);
  assert.equal(finished[0].fraction.build, 1);
  assert.equal(finished[0].done, finished[0].total);
});

test('pacing: a model that never answers hits its ceiling and the frame is marked failed', async (t) => {
  const never = () => new Promise<PhotoMeasurement | null>(() => undefined);
  const rec = recorder();
  const result = await drive(t, () =>
    runAnalysis(FRAMES.slice(0, 1), {
      deps: deps({ measureCoverage: never }),
      onProgress: rec.onProgress,
      pacing: { areaCeilingMs: 1200 },
    }),
  );
  assert.equal(result.aborted, false);
  const [frame] = result.frames;
  assert.equal(frame.area, 'failed');
  assert.equal(frame.coverage, null);
  assert.equal(frame.maskTrace, null);
  // The quality reading it did get is kept.
  assert.deepEqual(frame.quality, QUALITY.quality);

  const areaStart = rec.events.find((e) => e.unit.kind === 'area');
  const areaEnd = rec.events.find((e, i) => e.unit.kind === 'area' && i > rec.events.indexOf(areaStart!));
  assert.ok(areaStart && areaEnd);
  const shown = areaEnd.at - areaStart.at;
  assert.ok(shown >= 1200 && shown < 1300, `the ceiling let the unit run for ${shown}ms`);
});

test('pacing: a reading that throws is a frame with no reading, not a crash', async (t) => {
  const result = await drive(t, () =>
    runAnalysis(FRAMES, {
      deps: deps({
        analysePhoto: async (uri) => {
          if (uri.endsWith('a.jpg')) throw new Error('unreadable');
          return QUALITY;
        },
        measureCoverage: async (uri) => (uri.endsWith('c.jpg') ? null : AREA),
      }),
    }),
  );
  const byId = new Map(result.frames.map((f) => [f.id, f]));
  assert.equal(byId.get('a')?.quality, null);
  assert.deepEqual(byId.get('b')?.quality, QUALITY.quality);
  assert.equal(byId.get('c')?.area, 'failed');
  assert.equal(byId.get('b')?.area, 'measured');
  assert.deepEqual(byId.get('b')?.coverage, AREA.coverage);
  // 'a' has no quality reading but its area was measured: still counted.
  assert.equal(result.measured, 3);
});

test('pacing: a frame with no reading at all is finished with but never marked measured', async (t) => {
  const rec = recorder();
  const result = await drive(t, () =>
    runAnalysis(FRAMES, {
      deps: deps({
        analysePhoto: async (uri) => (uri.endsWith('a.jpg') ? null : QUALITY),
        measureCoverage: async (uri) => (uri.endsWith('a.jpg') ? null : AREA),
      }),
      onProgress: rec.onProgress,
    }),
  );
  const last = rec.events[rec.events.length - 1];
  assert.deepEqual(last.completedFrameIds, ['b', 'a', 'c']);
  assert.deepEqual(last.measuredFrameIds, ['b', 'c']);
  assert.equal(result.measured, 2);
  assert.equal(measuredFrameCount(result.frames), 2);
  // The order is the order the frames finished in, and a frame is never
  // in the measured list before it is in the completed list.
  for (const e of rec.events) {
    for (const id of e.measuredFrameIds) assert.ok(e.completedFrameIds.includes(id));
  }
});

test('pacing: measurements run one at a time — a hung model is never run beside', async (t) => {
  // The segmenter shares one interpreter with no queue of its own. When
  // the first area unit outruns its ceiling the runner moves on, but the
  // next measurement must queue behind the hung one rather than start a
  // second run on the same interpreter.
  const calls: string[] = [];
  const never = (uri: string) => {
    calls.push(uri);
    return new Promise<PhotoMeasurement | null>(() => undefined);
  };
  const rec = recorder();
  const result = await drive(t, () =>
    runAnalysis(FRAMES, {
      deps: deps({ measureCoverage: never }),
      onProgress: rec.onProgress,
      pacing: { areaCeilingMs: 600 },
    }),
  );
  assert.equal(calls.length, 1, `measureCoverage was started ${calls.length} times beside a hung run`);
  for (const frame of result.frames) assert.equal(frame.area, 'failed');
  // Each later area unit waited behind the hung one and hit its own
  // ceiling: bounded, never stalled, never stacked.
  const areaEnds = rec.events.filter((e, i) => e.unit.kind === 'area' && i % 2 === 1);
  assert.equal(areaEnds.length, 3);
  assert.equal(result.aborted, false);
});

test('pacing: a late reading is waited out before the next measurement starts', async (t) => {
  // The first area unit answers after its ceiling. The runner gives up on
  // it for the screen, but the second measurement still starts only once
  // the first has actually resolved.
  const started: { uri: string; at: number }[] = [];
  let resolvedFirstAt = 0;
  const slowThenFast = (uri: string) => {
    started.push({ uri, at: Date.now() });
    if (uri.endsWith('b.jpg')) {
      return after(1500, AREA).then((v) => {
        resolvedFirstAt = Date.now();
        return v;
      });
    }
    return Promise.resolve(AREA);
  };
  const result = await drive(t, () =>
    runAnalysis(FRAMES, {
      deps: deps({ measureCoverage: slowThenFast }),
      pacing: { areaCeilingMs: 600 },
    }),
  );
  const byId = new Map(result.frames.map((f) => [f.id, f]));
  // Outran its ceiling on screen, so the record says failed even though
  // the model eventually answered: the reading arrived after the pass had
  // moved on and is not back-filled into a bar that already advanced.
  assert.equal(byId.get('b')?.area, 'failed');
  // The second waited behind the first for longer than its own ceiling,
  // so it is failed too — bounded rather than stacked. The third queued
  // behind an already-settled lane and measured.
  assert.equal(byId.get('a')?.area, 'failed');
  assert.equal(byId.get('c')?.area, 'measured');
  const second = started.find((s) => s.uri.endsWith('a.jpg'));
  assert.ok(second, 'the second area measurement never ran');
  assert.ok(second.at >= resolvedFirstAt, `the second started at ${second.at}, before the first resolved at ${resolvedFirstAt}`);
});

/* ----------------------------- null model ----------------------------- */

test('null model: nothing is faked — no area units, every frame unavailable, the note is set', async (t) => {
  const rec = recorder();
  const result = await drive(t, () =>
    runAnalysis(FRAMES, { deps: deps({ measureCoverage: null }), onProgress: rec.onProgress }),
  );
  assert.equal(result.plan.areaAvailable, false);
  assert.equal(result.plan.note, ANALYSIS_COPY.areaUnavailable);
  for (const frame of result.frames) {
    assert.equal(frame.area, 'unavailable');
    assert.equal(frame.coverage, null);
    assert.equal(frame.maskTrace, null);
    assert.deepEqual(frame.quality, QUALITY.quality);
  }
  assert.ok(rec.events.every((e) => e.unit.kind !== 'area'));
  const labels = new Set(rec.events.map((e) => e.unit.label));
  assert.ok(!labels.has(ANALYSIS_COPY.unit.hairline));
  assert.ok(!labels.has(ANALYSIS_COPY.unit.coverage));
  assert.ok(labels.has(ANALYSIS_COPY.unit.compose));

  // With one unit per frame, frames complete during the first bar.
  const completedDuringAnalyse = rec.events
    .filter((e) => e.phase === 'analyse')
    .map((e) => e.completedFrameIds.length);
  assert.equal(Math.max(...completedDuringAnalyse), 3);
});

test('with the model, a frame completes only when its area unit has finished', async (t) => {
  const rec = recorder();
  await drive(t, () => runAnalysis(FRAMES, { deps: deps(), onProgress: rec.onProgress }));
  for (const e of rec.events) {
    if (e.phase === 'analyse') assert.equal(e.completedFrameIds.length, 0);
  }
  const last = rec.events[rec.events.length - 1];
  assert.deepEqual(last.completedFrameIds, ['b', 'a', 'c']);
});

/* -------------------------------- abort ------------------------------- */

test('abort: the pass stops between units and says the result is partial', async (t) => {
  const controller = new AbortController();
  const rec = recorder();
  const result = await drive(t, () =>
    runAnalysis(FRAMES, {
      deps: deps(),
      signal: controller.signal,
      onProgress: (p) => {
        rec.onProgress(p);
        if (p.done === 2) controller.abort();
      },
    }),
  );
  assert.equal(result.aborted, true);
  assert.equal(result.frames.length, 3);
  assert.ok(rec.events.every((e) => !e.finished));
  assert.ok(rec.events.length < 14, 'units kept running past the abort');
});

/* ----------------------------- the done line --------------------------- */

test('copy: the done line counts frames with a reading, not frames handed in', () => {
  assert.equal(ANALYSIS_COPY.done(5, 5), 'Five images measured on this device.');
  assert.equal(ANALYSIS_COPY.done(1, 1), 'One image measured on this device.');
  assert.equal(ANALYSIS_COPY.done(3, 5), 'Three of five images measured on this device.');
  assert.equal(ANALYSIS_COPY.done(0, 5), 'The images could not be measured on this device.');
  assert.equal(ANALYSIS_COPY.done(0, 0), 'The images could not be measured on this device.');
  // The engine keeps at most twelve; words all the way, digits past that.
  assert.equal(ANALYSIS_COPY.done(12, 12), 'Twelve images measured on this device.');
  assert.equal(ANALYSIS_COPY.done(13, 14), '13 of 14 images measured on this device.');
  for (let n = 1; n <= 12; n += 1) assert.ok(!/\d/.test(ANALYSIS_COPY.done(n, n)), `${n} came out in digits`);
});

test('copy: a pass over unreadable files does not say it measured them', async (t) => {
  const result = await drive(t, () =>
    runAnalysis(FRAMES, {
      deps: deps({ analysePhoto: async () => null, measureCoverage: null }),
    }),
  );
  assert.equal(result.measured, 0);
  assert.equal(ANALYSIS_COPY.done(result.measured, result.frames.length), 'The images could not be measured on this device.');
});

/* -------------------------------- orbit ------------------------------- */

test('orbit: positions sit on a ring, evenly spaced, alternating slightly inside', () => {
  assert.deepEqual(orbitPositions(0, 100), []);
  const four = orbitPositions(4, 100);
  assert.equal(four.length, 4);
  const radii = four.map((p) => Math.hypot(p.x, p.y));
  assert.ok(Math.abs(radii[0] - 100) < 1e-9);
  assert.ok(Math.abs(radii[1] - 90) < 1e-9);
  assert.ok(Math.abs(radii[2] - 100) < 1e-9);
  // A ring of four lands on the diagonals: nothing straight above the
  // disc, nothing straight below over the bars.
  for (const p of four) {
    assert.ok(Math.abs(p.x) > 30, `frame at x=${p.x} sits on the vertical axis`);
    assert.ok(Math.abs(p.y) > 30, `frame at y=${p.y} sits on the horizontal axis`);
  }
  // Evenly spaced by angle.
  const angles = orbitPositions(6, 80).map((p) => Math.atan2(p.y, p.x));
  for (let i = 1; i < angles.length; i += 1) {
    let step = angles[i] - angles[i - 1];
    if (step < 0) step += Math.PI * 2;
    assert.ok(Math.abs(step - Math.PI / 3) < 1e-9, `step ${i} was ${step}`);
  }
});

test('orbit: frames are full size on a loose ring and shrink on a crowded one', () => {
  assert.equal(orbitFrameSize(0, 140), ORBIT_FRAME_MAX);
  assert.equal(orbitFrameSize(4, 140), ORBIT_FRAME_MAX);
  const crowded = orbitFrameSize(11, 140);
  assert.ok(crowded < ORBIT_FRAME_MAX && crowded >= ORBIT_FRAME_MIN, `eleven frames drew at ${crowded}`);
  // Never below the floor, however many.
  assert.equal(orbitFrameSize(40, 100), ORBIT_FRAME_MIN);
  // Neighbours do not overlap at the drawn size.
  const spacing = (2 * Math.PI * 140) / 11;
  assert.ok(crowded <= spacing, `frames of ${crowded} overlap at ${spacing} apart`);
});

test('orbit: the ring takes a fixed time to form and to gather', () => {
  assert.equal(orbitSettleMs(0), 0);
  assert.equal(orbitSettleMs(1), 760);
  assert.equal(orbitSettleMs(5), 760 + 4 * 150);
  assert.equal(orbitConvergeMs(0), 0);
  assert.equal(orbitConvergeMs(5), 520 + 4 * 60);
  assert.equal(orbitReadyMs(4, 320, false), 320 + orbitSettleMs(4) + ORBIT_SETTLE_HOLD_MS);
  assert.equal(orbitReadyMs(4, 320, true, 240), 240 + ORBIT_SETTLE_HOLD_MS);
  assert.equal(orbitReadyMs(0, 320, false), 0);
});

test('orbit: the hand-off waits for the ring even when the pass ends first', () => {
  // The no-segmenter path on five frames: the first bar fills at 1750 ms
  // and the pass ends at the 2400 ms total floor, but four frames take
  // 320 + 760 + 3 × 150 = 1530 ms to settle after the orbit begins.
  const orbitStartedAt = 1750;
  const finishedAt = 2400;
  const plan = handoffSchedule({ count: 4, orbitStartedAt, finishedAt, leadMs: 320, reduceMotion: false });
  assert.ok(plan);
  const ringReadyAt = orbitStartedAt + orbitReadyMs(4, 320, false);
  assert.ok(ringReadyAt > finishedAt, 'this case must have the ring finishing after the pass');
  assert.equal(plan.convergeAt, ringReadyAt, 'the gather began before the ring had formed');
  assert.equal(plan.handoffAt, ringReadyAt + orbitConvergeMs(4) + HANDOFF_HOLD_MS);
});

test('orbit: the hand-off waits for the pass when the ring formed first', () => {
  // With the model, area units keep the second bar busy well past the ring.
  const plan = handoffSchedule({ count: 4, orbitStartedAt: 1750, finishedAt: 9000, leadMs: 320, reduceMotion: false });
  assert.ok(plan);
  assert.equal(plan.convergeAt, 9000);
  assert.equal(plan.handoffAt, 9000 + orbitConvergeMs(4) + HANDOFF_HOLD_MS);
});

test('orbit: nothing is scheduled until both the ring has begun and the pass has finished', () => {
  assert.equal(handoffSchedule({ count: 4, orbitStartedAt: null, finishedAt: 2400, leadMs: 320, reduceMotion: false }), null);
  assert.equal(handoffSchedule({ count: 4, orbitStartedAt: 1750, finishedAt: null, leadMs: 320, reduceMotion: false }), null);
  // Reduce Motion: frames appear in place, so only the fade is waited out.
  const reduced = handoffSchedule({ count: 4, orbitStartedAt: 1750, finishedAt: 2400, leadMs: 0, reduceMotion: true, reducedFadeMs: 240 });
  assert.ok(reduced);
  assert.equal(reduced.convergeAt, Math.max(1750 + 240 + ORBIT_SETTLE_HOLD_MS, 2400));
  assert.equal(reduced.handoffAt, reduced.convergeAt + 240 + HANDOFF_HOLD_MS);
});

/* ------------------------------ the build bar ------------------------- */

test('build bar: the runner\'s work fills only its share, and the bar holds there until the first arrival', () => {
  // Half the work is half the share, never half the bar.
  assert.ok(Math.abs(buildBarTarget({ workDone: 0.5, absorbed: 0, total: 4 }) - 0.5 * BUILD_BAR_WORK_SHARE) < 1e-9);
  // All the work done, nothing absorbed yet: the cap, exactly.
  assert.equal(buildBarTarget({ workDone: 1, absorbed: 0, total: 4 }), BUILD_BAR_WORK_SHARE);
  // The runner can report fractions on either side of the range; the bar cannot.
  assert.equal(buildBarTarget({ workDone: 1.4, absorbed: 0, total: 4 }), BUILD_BAR_WORK_SHARE);
  assert.equal(buildBarTarget({ workDone: -1, absorbed: 0, total: 4 }), 0);
  assert.ok(BUILD_BAR_WORK_SHARE > 0 && BUILD_BAR_WORK_SHARE < 1);
  assert.ok(BUILD_BAR_CREEP_RATIO > 0 && BUILD_BAR_CREEP_RATIO < 1, 'a ratio of 1 or more would not slow the bar down');
});

test('build bar: every arrival adds less than the one before, the last included, and the last completes it', () => {
  // The ring can hold anything from one frame to every region but the
  // main one (ScanRegion has nine members), so every count in that
  // range is held to the same shape: monotone, each step a fixed share
  // of the step before it — the last step too, which is the one an
  // ease that runs short and then snaps would break — and exactly 1 on
  // the last arrival and not before.
  for (let total = 1; total <= 8; total += 1) {
    const steps = Array.from({ length: total + 1 }, (_, absorbed) => buildBarTarget({ workDone: 1, absorbed, total }));
    assert.equal(steps[0], BUILD_BAR_WORK_SHARE, `total ${total}: the bar must hold at the cap before the first arrival`);
    assert.equal(steps[total], 1, `total ${total}: the last arrival must complete the bar`);
    for (let i = 1; i <= total; i += 1) {
      assert.ok(steps[i] > steps[i - 1], `total ${total}: arrival ${i} moved the bar backwards`);
      if (i < total) assert.ok(steps[i] < 1, `total ${total}: arrival ${i} completed the bar before the last`);
    }
    for (let i = 2; i <= total; i += 1) {
      const before = steps[i - 1] - steps[i - 2];
      const now = steps[i] - steps[i - 1];
      assert.ok(now < before, `total ${total}: arrival ${i} added ${now}, not less than arrival ${i - 1}'s ${before}`);
      assert.ok(
        Math.abs(now / before - BUILD_BAR_CREEP_RATIO) < 1e-9,
        `total ${total}: arrival ${i} added ${now / before} of the step before, not ${BUILD_BAR_CREEP_RATIO}`,
      );
    }
    // Past the last is still complete, never beyond.
    assert.equal(buildBarTarget({ workDone: 1, absorbed: total + 2, total }), 1);
  }
  // The shipped shape at four frames: the arrival before the last leaves
  // the bar at about 98%, so the last step is small but still a step.
  const penultimate = buildBarTarget({ workDone: 1, absorbed: 3, total: 4 });
  assert.ok(penultimate > 0.97 && penultimate < 0.99, `four frames: the bar sat at ${penultimate} before the last arrival`);
});

test('build bar: the bar never runs ahead of the work, whatever the gather says', () => {
  // Arrivals reported while the runner still has work left do not move the bar past the work's share.
  assert.ok(Math.abs(buildBarTarget({ workDone: 0.6, absorbed: 3, total: 4 }) - 0.6 * BUILD_BAR_WORK_SHARE) < 1e-9);
  assert.ok(Math.abs(buildBarTarget({ workDone: 0.6, absorbed: 4, total: 4 }) - 0.6 * BUILD_BAR_WORK_SHARE) < 1e-9);
});

test('build bar: with nothing to wait on the bar is the work alone; one beat stands in for the lone breath', () => {
  // A caller with no gather at all: uncapped.
  assert.equal(buildBarTarget({ workDone: 1, absorbed: 0, total: 0 }), 1);
  assert.equal(buildBarTarget({ workDone: 0.5, absorbed: 0, total: 0 }), 0.5);
  // The screen never passes 0: a scan that kept only the main frame, and
  // Reduce Motion, both wait on the disc's one breath.
  assert.equal(absorbBeats(0, false), 1);
  assert.equal(absorbBeats(4, false), 4);
  assert.equal(absorbBeats(4, true), 1);
  assert.equal(absorbBeats(0, true), 1);
  // One beat: the cap until the breath, complete on it.
  assert.equal(buildBarTarget({ workDone: 1, absorbed: 0, total: 1 }), BUILD_BAR_WORK_SHARE);
  assert.equal(buildBarTarget({ workDone: 1, absorbed: 1, total: 1 }), 1);
});

test('build bar: the floor on the count falls after the last arrival and before the hand-off', () => {
  // The screen completes the count on this clock only if the ring came
  // up short; for that to be a floor and not a pace, it must fall after
  // every real arrival would have been reported, and far enough before
  // the hand-off for the completed bar to be seen.
  for (let count = 1; count <= 8; count += 1) {
    const floor = absorbFloorMs(count, false, 240);
    assert.equal(floor, orbitAbsorbMs(count) + ORBIT_ABSORB_PULSE_MS, `count ${count}: the floor is the last glide and its breath`);
    assert.ok(floor > orbitAbsorbMs(count), `count ${count}: the floor fell before the last arrival`);
    assert.equal(absorbHandoffMs(count, false, 240) - floor, ORBIT_ABSORB_SETTLE_MS, `count ${count}: the settle must follow the floor`);
  }
  // Nothing gliding: the floor is the lone breath, and the same settle follows.
  assert.equal(absorbFloorMs(0, false, 240), ORBIT_ABSORB_PULSE_MS);
  assert.equal(absorbFloorMs(4, true, 240), 240 + ORBIT_ABSORB_PULSE_MS);
  assert.equal(absorbHandoffMs(4, true, 240) - absorbFloorMs(4, true, 240), ORBIT_ABSORB_SETTLE_MS);
});

test('build bar: over a real pass the bar climbs to its cap, reaches it only when the work is done, and the gather carries it on without a step back', async (t) => {
  // The no-segmenter path: five frames, the compose unit alone in the
  // second stage. The runner's build fractions are real here — the
  // events are what `runAnalysis` reported on the mocked clock — so
  // what this holds is the seam between the two clocks: the runner
  // reports the bar's cap only once every unit has finished (a runner
  // that reported the build full early would let the bar sit at its
  // cap over unfinished work), the pass ends at exactly the cap so the
  // gather has somewhere to start from, and the whole trajectory — the
  // pass's events and then the four arrivals — never moves backwards
  // and reaches 1 once, on the last arrival.
  const five: AnalysisFrame[] = [...FRAMES, { id: 'd', angle: 'crown', uri: 'file:///scan/d.jpg' }, { id: 'e', angle: 'top', uri: 'file:///scan/e.jpg' }];
  const rec = recorder();
  await drive(t, () => runAnalysis(five, { deps: deps({ measureCoverage: null }), onProgress: rec.onProgress }));
  assert.ok(rec.events.length > 2, 'the pass reported too few events to say anything');
  const total = absorbBeats(five.length - 1, false);
  assert.equal(total, 4);

  // Nothing is absorbed while the pass runs: the screen only starts the
  // gather once the runner has finished.
  const duringPass = rec.events.map((e) => ({
    target: buildBarTarget({ workDone: e.fraction.build, absorbed: 0, total }),
    workLeft: e.done < e.total,
    finished: e.finished,
  }));
  for (const [i, step] of duringPass.entries()) {
    if (step.workLeft) {
      assert.ok(step.target < BUILD_BAR_WORK_SHARE, `event ${i}: the bar reached its cap with ${rec.events[i].total - rec.events[i].done} unit(s) still to run`);
    }
  }
  const last = duringPass[duringPass.length - 1];
  assert.ok(last.finished, 'the last event must be the finished report');
  assert.equal(last.target, BUILD_BAR_WORK_SHARE, 'the finished pass must leave the bar exactly at the cap');

  // Then the gather, from the last work fraction the runner reported.
  const workDone = rec.events[rec.events.length - 1].fraction.build;
  const arrivals = Array.from({ length: total }, (_, k) => buildBarTarget({ workDone, absorbed: k + 1, total }));
  const trajectory = [...duringPass.map((s) => s.target), ...arrivals];
  for (let i = 1; i < trajectory.length; i += 1) {
    assert.ok(trajectory[i] >= trajectory[i - 1], `the bar moved backwards between steps ${i - 1} and ${i}: ${trajectory}`);
  }
  assert.equal(trajectory.filter((v) => v >= 1).length, 1, 'the bar must be complete exactly once, on the last arrival');
  assert.equal(trajectory[trajectory.length - 1], 1);
});

/* -------------------------------- copy -------------------------------- */

test('copy: every line the pass can say is swept, and none describes a head', () => {
  const sentences = analysisCopySentences();
  assert.ok(sentences.length >= 8, `only ${sentences.length} lines reached the sweep`);
  assert.ok(sentences.includes(ANALYSIS_COPY.done(3, 3)));
  assert.ok(sentences.includes(ANALYSIS_COPY.done(0, 5)));
  assertHonest(assert, sentences, 'the processing pass');
  const text = sentences.join(' ').toLowerCase();
  for (const word of ['before', 'after', 'forecast', 'predict', 'will']) {
    assert.ok(!text.includes(` ${word} `), `the processing pass must not say "${word}"`);
  }
});
