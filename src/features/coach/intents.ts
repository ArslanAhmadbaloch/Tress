/**
 * Routing a typed question to one of the coach's intents.
 *
 * There is no model here. A question is lower-cased, stripped to words,
 * and looked up against small phrase tables; the tables and the worked
 * table in the tests are the whole tuning surface. That keeps the coach
 * predictable — the same words always reach the same answer — and keeps
 * anything the person types on the device.
 *
 * ── Why refusals go first ─────────────────────────────────────────────
 * The coach answers from the record and nothing else. A question that
 * asks for advice on a treatment, a name for what is happening to
 * somebody's hair, or what will happen next has to be declined before
 * any word in it ("minoxidil", "consistent", "next set") gets a chance
 * to route it to a confident answer. So the three refusal checks run
 * before the person's own routine labels and before the data tables.
 *
 * The tables deliberately hold the words people *type* — "progress",
 * "improve my photo", "are you ai". They are input vocabulary and never
 * reach a template; the honesty sweep runs over `answers.ts` only.
 */

import type { CoachIntent, IntentMatch, MatchContext } from './types';

/**
 * Lower-case, drop apostrophes ("what's" → "whats"), turn everything that
 * is not a letter or digit into a space, collapse, trim, then pad with one
 * space either side so a phrase can be matched on whole words with a
 * plain `includes`.
 */
export function normalise(text: string): string {
  const flat = text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  // Empty input yields a single space, not two: §8.3 test 1 pins
  // `normalise('') === ' '`, and a lone space still fails every phrase.
  return flat ? ` ${flat} ` : ' ';
}

/* -------------------------------- tables -------------------------------- */

/**
 * An entry matches when it appears as whole words; an entry ending in `*`
 * matches as a prefix of a word ("treatment*" catches "treatments"). All
 * entries are lower-case ASCII, apostrophes already removed.
 */
type Table = readonly string[];

const TREATMENT: Table = [
  'minoxidil', 'finasteride', 'dutasteride', 'spironolactone', 'ketoconazole', 'rogaine',
  'propecia', 'nizoral', 'biotin', 'saw palmetto', 'rosemary', 'treatment*', 'medication*',
  'medicine*', 'meds', 'pill*', 'tablet*', 'drops', 'shampoo*', 'supplement*', 'vitamin*',
  'serum*', 'oil', 'oils', 'microneedl*', 'dermaroll*', 'derma roll*', 'prp', 'laser',
  'transplant*', 'prescription*', 'topical*', 'mg', 'dose*', 'dosage',
];

const MED_FRAME: Table = [
  'should i', 'should you', 'shall i', 'can i', 'could i', 'is it safe', 'safe to', 'is it ok to',
  'recommend*', 'suggest*', 'best', 'better than', 'switch*', 'swap*', 'work', 'works', 'working',
  'worth', 'dose*', 'dosage', 'how much', 'side effect*', 'increase', 'decrease', 'quit',
  'instead of', 'stop taking', 'start taking', 'stop using', 'start using', 'should i stop',
  'should i start',
];

const MED_BARE: Table = [
  'should i start', 'should i stop', 'start taking', 'stop taking', 'start using', 'stop using',
  'what should i take', 'what should i use', 'what can i take', 'what can i use',
  'what treatment', 'which treatment', 'best treatment', 'recommend*', 'dosage', 'side effect*',
  'how much should i',
];

const DX_BARE: Table = [
  'norwood', 'alopecia', 'diagnos*', 'receding', 'recede*', 'recession', 'bald*', 'thinning',
  'thin out', 'thinned', 'hair loss', 'losing hair', 'losing my hair', 'lose my hair',
  'whats wrong', 'what is wrong', 'male pattern', 'female pattern', 'pattern baldness', 'dht',
  'genetic*', 'hereditary', 'miniatur*', 'androgen*', 'what stage', 'which stage', 'stage am i',
  'how bad', 'severity', 'how severe', 'dermatologist', 'doctor', 'trichologist', 'clinic',
  'telogen', 'effluvium', 'scarring',
];

const DX_FRAME: Table = [
  'am i', 'is my', 'do i have', 'is this', 'is it', 'why is my', 'why am i', 'does my', 'are my',
  'has my', 'have i',
];

const HAIR_WORD: Table = [
  'hair', 'scalp', 'hairline', 'crown', 'temple*', 'part', 'parting', 'shedding', 'ponytail',
  'edges', 'follicle*',
];

const DX_JUDGEMENT: Table = [
  'worse', 'better', 'normal', 'ok', 'okay', 'fine', 'bad', 'good', 'healthy', 'thin', 'thinner',
  'going', 'receding', 'shedding', 'falling', 'damaged', 'unhealthy', 'wrong',
];

const PREDICT_BARE: Table = [
  'predict*', 'forecast*', 'grow back', 'regrow*', 'get worse', 'get better', 'getting worse',
  'getting better', 'got worse', 'got better', 'any better', 'any worse', 'improving',
  'improvement', 'improve my hair', 'hair improve', 'is it working', 'is this working',
  'routine working', 'routine work*', 'working yet', 'working for me', 'is working',
  'will it work', 'will this work', 'will that work', 'does it work', 'does this work',
  'see results', 'any results', 'results yet', 'months from now', 'in 6 months', 'in six months',
  'in a year', 'by next year', 'by christmas', 'by summer', 'how long before', 'when will i see',
  'chances', 'odds', 'likely to',
];

const PREDICT_FRAME: Table = [
  'will', 'wont', 'going to', 'gonna', 'expect*', 'future', 'eventually', 'ever', 'someday',
  'likely', 'chance',
];

const PREDICT_SUBJECT: Table = [
  'hair', 'hairline', 'crown', 'scalp', 'grow*', 'shed*', 'thin*', 'bald*', 'temple*', 'part',
  'parting', 'look*', 'ponytail', 'edges', 'regrow*', 'results', 'recover*', 'fill in', 'come back',
];

/** Every data intent, in the order that breaks a tie. */
export const DATA_INTENT_ORDER: readonly CoachIntent[] = [
  'consistency', 'streak', 'keepSame', 'compare', 'nextSet', 'lastScan', 'areaMeaning', 'record',
  'stack', 'journal', 'goals', 'privacy', 'help',
];

const DATA_TABLES: Readonly<Record<string, Table>> = {
  consistency: [
    'consisten*', 'adheren*', 'keeping up', 'kept up', 'keep up', 'how am i doing',
    'how is it going', 'how have i done', 'how have i been doing', 'tick*', 'missed', 'miss',
    'skipped', 'skip', 'on track', 'stuck to', 'sticking to', 'stick to', 'followed', 'following',
    'did i do', 'have i done', 'percent*', 'this month', 'last 30 days', 'last month', 'this week',
    'last week', 'how well', 'completion', 'done everything', 'kept to',
  ],
  streak: ['streak*', 'run', 'in a row', 'days straight', 'longest', 'best run', 'chain', 'unbroken'],
  keepSame: [
    'keep the same', 'same as last', 'same as before', 'same', 'next time', 'how should i take',
    'how do i take', 'how to take', 'tip*', 'framing', 'frame it', 'distance', 'angle*',
    'position*', 'pose', 'setup', 'set up', 'good photo*', 'better photo*', 'improve my photo*',
    'improve the photo*', 'lighting', 'background', 'time of day', 'retake*', 'line up', 'match*',
    'comparable',
  ],
  compare: [
    'changed', 'change', 'changes', 'difference', 'different', 'differ', 'compare*', 'comparison',
    'since last', 'since my last', 'than last', 'last time', 'between', 'moved', 'last two',
    'two sets', 'before and after', 'then and now', 'versus', 'vs', 'progress*', 'trend',
    'gone up', 'gone down', 'up or down', 'higher', 'lower', 'more or less',
  ],
  nextSet: [
    'next set', 'next photo*', 'next update', 'next session', 'next scan', 'next shot', 'due',
    'overdue', 'remind*', 'schedule*', 'how often', 'interval', 'late', 'when should i take',
    'when do i take', 'when is my next', 'when is the next', 'whens my next', 'whens the next',
    'time for', 'days until', 'days left', 'how long until', 'how long till', 'until my next',
    'till my next',
  ],
  lastScan: [
    'last scan', 'scan*', 'reading*', 'measure*', 'what did it say', 'what did it measure',
    'light', 'lit', 'sharp*', 'focus', 'blur*', 'burnt', 'bright*', 'dark', 'coverage',
    'upper frame', 'quality', 'first photo*', 'last photo*', 'last set say', 'my last set',
    'latest set', 'balance', 'number*',
  ],
  areaMeaning: [
    'what does area', 'area mean*', 'what is area', 'what is the area', 'mean', 'means', 'meaning',
    'coverage mean*', 'what does coverage', 'mask', 'segment*', 'ring', 'rings', 'explain*',
    'what does the number', 'what do the numbers', 'what does that mean', 'what does it mean',
    'what does this mean', 'how is it measured', 'how does it measure', 'how is area',
    'how do you measure', 'what is measured', 'area',
  ],
  record: [
    'how many', 'how many sets', 'how many photos', 'how many sessions', 'how many angles',
    'angles in', 'missing angle*', 'which angles', 'my record', 'the record', 'baseline',
    'how long have i', 'since i started', 'when did i start', 'when i started', 'did i start',
    'journey', 'history', 'timeline', 'so far', 'recorded', 'sets have i', 'photos have i',
    'first set', 'oldest', 'day one', 'day 1', 'how long ago',
  ],
  stack: [
    'stack', 'my routine', 'the routine', 'routine', 'what do i take', 'what am i taking',
    'what am i using', 'what do i use', 'items', 'what is in', 'whats in', 'taking', 'using',
    'products', 'regimen', 'regime', 'list',
  ],
  journal: [
    'journal*', 'notes', 'note', 'wrote', 'written', 'entries', 'entry', 'diary',
    'what did i write', 'noted',
  ],
  goals: [
    'goal*', 'wanted', 'what did i say', 'my answers', 'answers', 'said i', 'tracking', 'track',
    'areas', 'why did i', 'motivation*', 'hoped', 'hope', 'hoping', 'when i signed up',
    'at the start', 'onboarding', 'questionnaire', 'what am i tracking', 'watching',
  ],
  privacy: [
    'where do my photos', 'photos go', 'upload*', 'cloud', 'server*', 'private', 'privacy',
    'leave the device', 'leave my phone', 'leave the phone', 'leaves my phone', 'stored', 'store',
    'who can see', 'sent anywhere', 'sent to', 'my data', 'on device', 'on the device', 'offline',
    'internet', 'online', 'shared', 'share', 'anyone see', 'safe', 'secure', 'delete my', 'saved',
  ],
  help: [
    'hi', 'hello', 'hey', 'thanks', 'thank you', 'help', 'what can you', 'what do you know',
    'what can i ask', 'who are you', 'what are you', 'are you ai', 'are you an ai', 'are you a bot',
    'how does this work', 'what is this',
  ],
};

/* ------------------------------- matching ------------------------------- */

function isPrefix(entry: string): boolean {
  return entry.endsWith('*');
}

/** The entry's text with any trailing `*` removed. */
function stem(entry: string): string {
  return isPrefix(entry) ? entry.slice(0, -1) : entry;
}

function entryMatches(t: string, entry: string): boolean {
  return isPrefix(entry) ? t.includes(` ${stem(entry)}`) : t.includes(` ${entry} `);
}

function anyMatch(t: string, table: Table): boolean {
  return table.some((entry) => entryMatches(t, entry));
}

/**
 * Matched entries of one table, minus any whose text is contained in
 * another matched entry of the same table — "same" inside "keep the same"
 * is one hit, not two.
 */
function scoreTable(t: string, table: Table): number {
  const hits = table.filter((entry) => entryMatches(t, entry)).map(stem);
  return hits.filter(
    (hit) => !hits.some((other) => other !== hit && other.includes(hit)),
  ).length;
}

/* ---------------------------- routine labels ---------------------------- */

/**
 * Words that appear in routine labels without naming the thing. Any of
 * these as the only token of a label would route half the questions
 * somebody could ask to that item.
 */
const LABEL_STOPWORDS: readonly string[] = [
  'hair', 'daily', 'morning', 'evening', 'night', 'with', 'from', 'this', 'that', 'time', 'times',
  'week', 'weekly', 'once', 'twice', 'something', 'else', 'nothing', 'right', 'other', 'every',
  'topical', 'oral', 'tablet', 'tablets', 'drops', 'shampoo', 'supplement', 'treatment',
  'medication', 'routine', 'care',
];

/**
 * Every entry in this file, stems only, except the treatment names. A label
 * token that is also a routing or refusal phrase ("routine", "same") belongs
 * to the table, not to the item, so it is not allowed to route. Treatment
 * names are what labels *are* ("Minoxidil (topical)"), and the refusal
 * checks have already run by the time a label is consulted, so they stay.
 */
const ALL_ENTRIES: ReadonlySet<string> = new Set(
  [
    MED_FRAME, MED_BARE, DX_BARE, DX_FRAME, HAIR_WORD, DX_JUDGEMENT, PREDICT_BARE, PREDICT_FRAME,
    PREDICT_SUBJECT, ...Object.values(DATA_TABLES),
  ]
    .flat()
    .map(stem),
);

/** The words of a routine label that may route a question to that item. */
function labelTokens(label: string): string[] {
  return label
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(
      (token) =>
        token.length >= 4 && !LABEL_STOPWORDS.includes(token) && !ALL_ENTRIES.has(token),
    );
}

/* -------------------------------- routing ------------------------------- */

export function matchIntent(text: string, ctx?: MatchContext): IntentMatch {
  const t = normalise(text);
  if (t.trim().length === 0) return { intent: 'unknown' };

  // Refusals first: a treatment or hair word in the same sentence must not
  // be allowed to route the question to an answer.
  const treatment = anyMatch(t, TREATMENT);
  if (anyMatch(t, MED_BARE) || (anyMatch(t, MED_FRAME) && treatment)) {
    return { intent: 'refuseMedication' };
  }
  if (
    anyMatch(t, DX_BARE) ||
    (anyMatch(t, DX_FRAME) && anyMatch(t, HAIR_WORD) && anyMatch(t, DX_JUDGEMENT))
  ) {
    return { intent: 'refuseDiagnose' };
  }
  if (
    anyMatch(t, PREDICT_BARE) ||
    (anyMatch(t, PREDICT_FRAME) && anyMatch(t, PREDICT_SUBJECT))
  ) {
    return { intent: 'refusePredict' };
  }

  // The person's own routine labels: naming an item asks about that item.
  for (const { id, label } of ctx?.itemLabels ?? []) {
    if (labelTokens(label).some((token) => t.includes(` ${token} `))) {
      return { intent: 'itemAdherence', itemId: id };
    }
  }

  // Highest score wins; a tie goes to the earlier intent in the order.
  let best: CoachIntent | null = null;
  let bestScore = 0;
  for (const intent of DATA_INTENT_ORDER) {
    const score = scoreTable(t, DATA_TABLES[intent]);
    if (score > bestScore) {
      best = intent;
      bestScore = score;
    }
  }
  if (best) return { intent: best };

  // A treatment named with nothing else understood and no advice asked:
  // the stack answer shows what they recorded taking.
  if (treatment) return { intent: 'stack' };

  return { intent: 'unknown' };
}
