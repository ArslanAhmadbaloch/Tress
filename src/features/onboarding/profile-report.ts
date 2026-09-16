/**
 * The report somebody is shown before the app opens.
 *
 * It is built entirely from answers they gave two minutes ago, and its
 * job is recognition: a person should read it and think *yes, that is
 * where I am*. That is what makes the next screen — the one asking for
 * money — feel like a continuation rather than an ambush.
 *
 * ── The line, which is narrow and load-bearing ────────────────────────
 * Reflecting somebody's own words back is honest personalisation. Turning
 * those words into findings they did not state is not. "You told us you
 * first noticed it six months ago" is theirs. "Your crown is thinning" is
 * a claim about a head nobody has looked at, and at this point in the
 * funnel no photograph exists at all.
 *
 * So every line here follows the same shape: *what you said* → *what that
 * means for tracking it*. The conclusion is always about the record, and
 * the record is a thing this app can actually affect. It reads as
 * insight because it is specific, not because it is bold.
 */

import {
  APPROACH_LABELS,
  goalSentence,
  joinPhrases,
  MEDICATION_LABELS,
  ONSET_LABELS,
  TRACKING_AREA_LABELS,
  type Approach,
  type HairGoal,
  type Medication,
  type Onset,
  type SelfConsistency,
  type TrackingArea,
} from '@/types/domain';

export type ProfileAnswers = {
  name: string;
  noticed: Onset | null;
  areas: TrackingArea[];
  preoccupation: number | null;
  approaches: Approach[];
  medications: Medication[];
  consistency: SelfConsistency | null;
  /** Everything they ticked on the goal step; empty if they ticked nothing. */
  goals: HairGoal[];
  intervalDays: number;
};

export type ProfileCard = {
  id: string;
  /** The short label above the line, e.g. "Where you're starting". */
  eyebrow: string;
  /** What they told us, in their words where possible. */
  echo: string;
  /** What that means for the record — never for their hair. */
  meaning: string;
};

export type ProfileReport = {
  title: string;
  cards: ProfileCard[];
  /** One sentence closing the report, before the next screen. */
  closing: string;
};

/* ----------------------------- the cards ------------------------------- */

function startingCard(a: ProfileAnswers): ProfileCard | null {
  if (!a.noticed) return null;

  const when = ONSET_LABELS[a.noticed].toLowerCase();
  const often = (a.preoccupation ?? 0) >= 4;

  return {
    id: 'starting',
    eyebrow: 'Where you’re starting',
    echo: often
      ? `You first noticed something ${when}, and it crosses your mind often.`
      : `You first noticed something ${when}.`,
    /*
      The most useful true thing to say to somebody at this point: the
      reason they cannot answer their own question is that they have a
      memory and no record. That is precisely the gap the app closes, and
      saying it does not require knowing anything about their hair.
    */
    meaning:
      'That is the gap a record closes. You have a memory of how things were, and nothing to hold it against — so every month feels like a judgement call rather than a comparison.',
  };
}

function watchingCard(a: ProfileAnswers): ProfileCard | null {
  if (a.areas.length === 0) return null;

  const areas = joinPhrases(a.areas.map((x) => TRACKING_AREA_LABELS[x].toLowerCase()));
  return {
    id: 'watching',
    eyebrow: 'What we’ll watch',
    echo: `You said you notice it most at the ${areas}.`,
    meaning:
      'Your updates will still cover all five angles — the one you are not watching is the one that makes the others readable — but this is the one the comparisons will open on.',
  };
}

function doingCard(a: ProfileAnswers): ProfileCard | null {
  const named = a.medications.map((m) => MEDICATION_LABELS[m]);
  const broad = a.approaches.map((x) => APPROACH_LABELS[x].toLowerCase());
  const doing = named.length > 0 ? named : broad;
  if (doing.length === 0) {
    return {
      id: 'doing',
      eyebrow: 'What you’re doing',
      echo: 'You are not using anything yet.',
      meaning:
        'That makes this the most useful moment to start a record. Whatever you begin later has a real before to be measured against, which is something most people never manage to keep.',
    };
  }

  const honest = a.consistency === 'onOff' || a.consistency === 'forget';
  return {
    id: 'doing',
    eyebrow: 'What you’re doing',
    echo: `You’re using ${joinPhrases(doing)}${honest ? ', and you said you keep to it on and off.' : '.'}`,
    meaning: honest
      ? 'Worth saying plainly: almost everybody answers that way, and almost everybody is closer to the truth than the people who say they never miss. Ticking it off is what turns a guess into a number.'
      : 'Ticking each one off is what lets a photograph six months from now be read against what you were actually doing at the time, rather than what you meant to be doing.',
  };
}

function rhythmCard(a: ProfileAnswers): ProfileCard {
  const monthly = a.intervalDays >= 28;
  return {
    id: 'rhythm',
    eyebrow: 'Your rhythm',
    echo: monthly
      ? 'You chose to check in once a month.'
      : `You chose to check in every ${a.intervalDays} days.`,
    meaning: monthly
      ? 'Which matches how hair actually moves. Anything more often mostly measures the weather, your last wash, and where you were standing.'
      : 'More often than most people need. It is your record — but expect the difference between two close-together sets to be lighting rather than hair.',
  };
}

export function buildProfileReport(a: ProfileAnswers): ProfileReport {
  const cards = [startingCard(a), watchingCard(a), doingCard(a), rhythmCard(a)].filter(
    (c): c is ProfileCard => c !== null,
  );

  /*
    Several, joined as somebody would say them: "more fullness and less
    shedding". The sentence below holds whatever length that comes to,
    because the only part of it that changes is the list itself.

    "I'm not sure yet" is not a thing somebody wants, so it is dropped
    rather than read back as one — a sentence saying "what you want is
    I'm not sure yet" puts an answer in their mouth. It cannot stand
    beside another goal on the step, so dropping it leaves nothing, and
    the closing falls through to the line that states no goal at all.
  */
  const stated = a.goals.filter((g) => g !== 'unsure');
  const goals = stated.length > 0 ? goalSentence(stated) : null;

  return {
    title: a.name.trim() ? `${a.name.trim()}, here’s where you stand.` : 'Here’s where you stand.',
    cards,
    /*
      The closing line is the only place the goals appear, and they are
      phrased as theirs rather than as a promise. "Whether you get there
      is not ours to say" is not modesty — it is the difference between a
      tracking app and a treatment claim. Several of them change the list
      and nothing else: "what you want is X and Y" is still something
      they said, and must never slide into "you will get X and Y".
    */
    closing: goals
      ? `You told us what you want is ${goals}. Whether you get there is not ours to promise — what we can do is make sure you can see it happening, or not happening, instead of wondering.`
      : 'What we can do is make sure you can see what is happening, instead of wondering.',
  };
}
