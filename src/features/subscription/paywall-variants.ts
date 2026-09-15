/**
 * The paywall's copy, and which framing somebody sees.
 *
 * Everything on the paywall that is a sentence lives here rather than in
 * the screen, for two reasons. The screen is JSX and the tests are Node,
 * so copy kept in a pure module is copy the tests can actually read. And
 * the paywall is where an app's honesty is cheapest to sell — one file
 * that the sweep covers is a smaller surface than four.
 *
 * ── Why there is more than one framing ─────────────────────────────────
 * The apps that do this well run several framings at once and keep the
 * one that earns its place. Tress has no experiment service, so this is
 * the honest small version: a fixed set of variants, assigned by hashing
 * a per-install id, stable for the life of that install.
 *
 * Stability is the part that matters. A paywall that reworded itself
 * every time it opened would make somebody feel they were being worked
 * on — and it would make the numbers meaningless, since nobody would
 * stay in one arm long enough to convert.
 *
 * ── What the variants are allowed to differ on ────────────────────────
 * The framing, and nothing else. Every variant names the same price, the
 * same trial and the same features, because the thing being tested is
 * which true sentence lands — not how much can be left out. There is no
 * countdown, no struck-through price, no invented scarcity and no "3
 * spots left", because those work by making somebody believe a thing that
 * is not so, and the refunds come back with the reason attached.
 */

import type { IconName } from '@/components/ui/icon';
import { formatDate } from '@/lib/date';
import { baselineSession } from '@/store/selectors';
import { ANGLE_LABELS, type Angle, type AppData, type Photo } from '@/types/domain';
import type { PlanConfig } from './config';

export type PaywallVariantId = 'record' | 'compare' | 'consistency';

export type PaywallVariant = {
  id: PaywallVariantId;
  headline: string;
  /** One sentence under it. Same offer, different door in. */
  body: string;
};

export const PAYWALL_VARIANTS: Record<PaywallVariantId, PaywallVariant> = {
  /* The default: what they are about to lose if they stop here. */
  record: {
    id: 'record',
    headline: 'Your journey is ready.',
    body: 'Keep the record going — the photographs, the notes and the routine, in one place that only you can open.',
  },
  /* Leads on the thing the app is actually for. */
  compare: {
    id: 'compare',
    headline: 'The month that proves it is still months away.',
    body: 'Nothing visible happens between two photographs a week apart. Premium keeps every set so the ones that matter — three months, six, a year — are there when you want them.',
  },
  /* Leads on the behaviour rather than the artefact. */
  consistency: {
    id: 'consistency',
    headline: 'The hard part is turning up.',
    body: 'Not the products, not the plan. Premium keeps score of the days you actually did it, so six months from now you know what you were really doing.',
  },
};

const IDS: PaywallVariantId[] = ['record', 'compare', 'consistency'];

/**
 * Stable 32-bit hash. Not cryptographic and does not need to be — it
 * only has to spread installs evenly and give the same answer twice.
 */
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function variantFor(installId: string): PaywallVariant {
  if (!installId) return PAYWALL_VARIANTS.record;
  return PAYWALL_VARIANTS[IDS[hash(installId) % IDS.length]];
}

/* ------------------------------------------------------------------ *
 * The hero: their own first photograph
 *
 * The reference apps put the person's own picture at the top of the
 * subscription screen, and it is the right instinct — the thing being
 * paid for is a record, and the record is of them. What they also do,
 * and this does not, is put a second picture beside it. There is no
 * "after" on this screen, generated or borrowed or implied, because the
 * app has no idea what anybody's hair will do and a picture that
 * suggests otherwise is a promise made with somebody else's face.
 *
 * So: one photograph, the earliest they have, exactly as they took it.
 * ------------------------------------------------------------------ */

export type PaywallHero = {
  /**
   * Where the picture came from, so the caption can say so. A session
   * photograph is captioned by its angle; the portrait from onboarding
   * is captioned as a portrait, because calling it a hairline shot would
   * be a small lie in a place that cannot afford any.
   */
  source: 'session' | 'portrait';
  /** The display-resolution file. */
  uri: string;
  /** The pre-scaled thumbnail, shown while the display file decodes. */
  placeholderUri: string | null;
  /** When the shutter fired — never editable, see PhotoSession.title. */
  takenAt: string;
  /** "Hairline", "Left Side" — or "Portrait" for the onboarding photo. */
  label: string;
};

export const HERO_COPY = {
  title: 'Your starting point',
  /** Under the empty frame, before any photograph exists. */
  emptyBody: 'The first set of photographs you take is kept here.',
  /** Beside the caption, in every state. The one claim this card makes. */
  onDevice: 'On this device',
  portraitLabel: 'Portrait',
} as const;

/**
 * Which angle to lead with when the baseline set has several.
 *
 * The hairline shot is the one taken facing the camera, so it is the one
 * that reads as a photograph of a person rather than of a scalp; the
 * sides are next for the same reason. Top and back are last — they are
 * the most useful frames in the record and the least kind ones to open a
 * screen with.
 */
const HERO_ANGLE_PREFERENCE: Angle[] = ['front', 'rightTemple', 'leftTemple', 'top', 'crown'];

function pickHeroPhoto(photos: Photo[]): Photo | null {
  for (const angle of HERO_ANGLE_PREFERENCE) {
    const match = photos.find((p) => p.angle === angle);
    if (match) return match;
  }
  return photos[0] ?? null;
}

/**
 * The photograph to open the paywall with, or null when there is none.
 *
 * Order of preference: the earliest photo session (the baseline, which
 * is the *last* entry because sessions are stored newest-first), then
 * the portrait taken during onboarding, then nothing — in which case the
 * screen draws a quiet empty frame rather than borrowing a picture of
 * somebody else.
 */
export function heroFor(data: AppData): PaywallHero | null {
  const baseline = baselineSession(data);
  const photo = baseline ? pickHeroPhoto(baseline.photos) : null;
  if (photo) {
    return {
      source: 'session',
      uri: photo.uri,
      placeholderUri: photo.thumbnailUri ?? null,
      takenAt: photo.capturedAt,
      label: ANGLE_LABELS[photo.angle],
    };
  }

  const profile = data.profile;
  if (profile?.avatarUri) {
    return {
      source: 'portrait',
      uri: profile.avatarUri,
      placeholderUri: null,
      takenAt: profile.createdAt,
      label: HERO_COPY.portraitLabel,
    };
  }

  return null;
}

/** "Hairline · 15 Sept 2026". A fact about the file, nothing more. */
export function heroCaption(hero: PaywallHero): string {
  return `${hero.label} · ${formatDate(hero.takenAt)}`;
}

/** What a screen reader hears for the frame. */
export function heroAccessibilityLabel(hero: PaywallHero | null): string {
  if (!hero) return `${HERO_COPY.title}. ${HERO_COPY.emptyBody} ${HERO_COPY.onDevice}.`;
  return `${HERO_COPY.title}. Your ${hero.label.toLowerCase()} photograph, taken ${formatDate(hero.takenAt)}. ${HERO_COPY.onDevice}.`;
}

/* ------------------------------------------------------------------ *
 * What Premium actually gives you
 *
 * Four lines, each a thing the app does rather than a thing it promises
 * will happen to your hair. Nothing here claims growth, and nothing here
 * implies the app produces a medical outcome — what is being sold is the
 * record and the clarity, which is the part we can actually deliver.
 * ------------------------------------------------------------------ */

export type PremiumBenefit = { icon: IconName; title: string; body: string };

export const PREMIUM_BENEFITS: PremiumBenefit[] = [
  {
    icon: 'camera',
    title: 'Unlimited photo sets',
    body: 'Every five-angle update, kept in the order you took it.',
  },
  {
    icon: 'compare',
    title: 'Side-by-side comparison',
    body: 'Any two dates in your record, next to each other.',
  },
  {
    icon: 'bottle',
    title: 'Your routine and stack',
    body: 'What you use, and how steadily you keep to it.',
  },
  {
    icon: 'shield',
    title: 'Private by design',
    body: 'Everything stays on this device. Nothing is uploaded.',
  },
];

/* ------------------------------------------------------------------ *
 * The price, in words
 *
 * The line directly above the button that charges them. When the store
 * is offering this person a trial it has to lead with that and still
 * name the price the trial turns into — a "7 days free" with no number
 * after it is the pattern the App Store rejects, and deserves to.
 * ------------------------------------------------------------------ */

/** "$49.99 a year · about $4.17 a month", or "$7.99 a month". */
export function recurringLine(plan: PlanConfig): string {
  return plan.period === 'year'
    ? `${plan.formattedPrice} a year · about ${plan.formattedMonthlyEquivalent} a month`
    : `${plan.formattedPrice} a month`;
}

/** The recurring line, led by the trial when there is one. */
export function priceLine(plan: PlanConfig): string {
  const recurring = recurringLine(plan);
  return plan.trial ? `${plan.trial.duration} free, then ${recurring}` : recurring;
}

/**
 * The renewal terms under the button. Every clause the stores require,
 * in one sentence a person can read: what renews, at what price, and
 * how to stop it.
 */
export function renewalTerms(plan: PlanConfig): string {
  const lead = plan.trial
    ? `Your first ${plan.trial.duration} are free. After that the subscription renews automatically at ${plan.formattedPrice} unless cancelled at least 24 hours before the trial ends.`
    : 'Subscriptions renew automatically unless cancelled.';
  return `${lead} Payment is charged to your App Store or Google Play account. Cancel anytime in your account settings.`;
}

export const CTA_COPY = {
  trial: 'Start My Free Trial',
  subscribe: 'Start My Journey',
  /** Shown briefly after a purchase goes through, before the sheet closes. */
  done: 'Your journey is ready',
  restore: 'Restore Purchases',
  restoring: 'Checking your purchases…',
} as const;

export function ctaLabel(plan: PlanConfig, succeeded: boolean): string {
  if (succeeded) return CTA_COPY.done;
  return plan.trial ? CTA_COPY.trial : CTA_COPY.subscribe;
}

/**
 * The one second ask, shown the next time the paywall opens after somebody
 * has closed it without buying.
 *
 * Once per install, never again — it is recorded the first time it is
 * shown rather than the first time it is accepted, so declining twice is
 * not possible (see device-preferences.ts). A sheet that reappears on
 * every dismissal is the pattern that gets apps reported, and it teaches
 * people to stop opening the app rather than to subscribe.
 *
 * Only the headline and body change. The photograph, the benefits, the
 * plans, the price and the terms are exactly what the first visit showed,
 * because a second ask that quietly moved the price would be a different
 * offer wearing the first one's clothes.
 *
 * It also says the true thing about leaving: the journey is kept either
 * way. Implying somebody would lose their photographs by not paying
 * would be a threat, and an untrue one.
 */
export const SECOND_ASK = {
  headline: 'Before you go.',
  body: 'Your photographs and notes stay on this device either way — nothing is deleted and nothing is held back from you. Premium is what keeps new sets coming and puts them side by side.',
  accept: 'See Premium again',
  decline: 'Not now',
};

export type PaywallCopy = Pick<PaywallVariant, 'headline' | 'body'>;

/** The two sentences at the top of the screen for this visit. */
export function paywallCopy(variant: PaywallVariant, secondAsk: boolean): PaywallCopy {
  return secondAsk
    ? { headline: SECOND_ASK.headline, body: SECOND_ASK.body }
    : { headline: variant.headline, body: variant.body };
}
