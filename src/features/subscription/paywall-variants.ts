/**
 * The paywall's copy, and which framing somebody sees.
 *
 * Everything on the paywall that is a sentence lives here rather than in
 * the screen, for two reasons. The screen is JSX and the tests are Node,
 * so copy kept in a pure module is copy the tests can actually read. And
 * the paywall is where an app's honesty is cheapest to sell — one file
 * that the sweep covers is a smaller surface than four.
 *
 * ── The page, in the reference's rhythm ───────────────────────────────
 * Two tilted photograph cards at the top, a headline, three icon
 * benefits in a row, the plan cards, a promo-code and restore line, one
 * button. That is the reference's paywall, and the owner asked for it
 * in Tress's palette. Nothing sits between the headline and the three
 * benefits — the reference has no paragraph there, and neither does
 * this. What did not come across is the half of it that works by making
 * somebody believe a thing that is not so: the second photograph
 * labelled "after", the free-trial toggle, the countdown.
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
 * One sentence, and nothing else — and it is not on the first visit. The
 * first ask is drawn as the reference draws it: headline, then the three
 * benefits, with no framing paragraph between them. The variant's
 * sentence is the second half of the one second ask (see SECOND_ASK),
 * where a sentence of framing belongs: somebody has closed the screen
 * once and is being asked a single further time. Every variant names
 * the same price and the same benefits, because the thing being tested
 * is which true sentence lands — not how much can be left out. There is no countdown, no struck-through price,
 * no invented scarcity and no "3 spots left", because those work by
 * making somebody believe a thing that is not so, and the refunds come
 * back with the reason attached.
 *
 * There is also no free trial, anywhere on this screen — not as an offer
 * and not as the reference's Premium | Free Trial toggle. The offer is a
 * straight subscription at a price stated on the card that is chosen and
 * again in the terms under the button, which is the version of this
 * screen with nothing to forget to cancel. See TrialTerms in config.ts
 * for what is left of the idea.
 */

import type { IconName } from '@/components/ui/icon';
import { formatDate, formatDateShort, toDateKey } from '@/lib/date';
import { latestSession, nextUpdate } from '@/store/selectors';
import { ANGLE_LABELS, type Angle, type AppData, type Photo } from '@/types/domain';
import type { PlanConfig, PlanId } from './config';

/** The headline of the first ask. Fixed across variants, and alone: the
    three benefits follow it directly, as in the reference. */
export const PAYWALL_TITLE = 'Unlock Tress Premium';

export type PaywallVariantId = 'record' | 'compare' | 'consistency';

export type PaywallVariant = {
  id: PaywallVariantId;
  /** One sentence, the second half of the second ask. Same offer,
      different door in. */
  body: string;
};

export const PAYWALL_VARIANTS: Record<PaywallVariantId, PaywallVariant> = {
  /* The default: what stops here if they stop here. */
  record: {
    id: 'record',
    body: 'Premium keeps the record going — every scan, the notes and the routine, in one place.',
  },
  /* Leads on the thing the app is actually for. */
  compare: {
    id: 'compare',
    body: 'Nothing shows between two scans a week apart. Premium keeps every scan, so the months are there when you want them.',
  },
  /* Leads on the behaviour rather than the artefact. */
  consistency: {
    id: 'consistency',
    body: 'The hard part is turning up. Premium keeps score of the days you did it, so later you know what you were really doing.',
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
 * The two cards: their latest photograph, and an empty frame
 *
 * The reference opens its paywall with the person's own picture twice,
 * tilted, labelled "before" and "after" — the same photograph both
 * times, which is the tell. The first half of that is right: the thing
 * being paid for is a record, and the record is of them. So the left
 * card is their latest scan, exactly as they took it.
 *
 * The right card is an EMPTY frame, dashed, labelled with the date the
 * record says the next scan is due. Not a second copy of the photograph
 * and not a generated after, because the app has no idea what anybody's
 * hair will do and a picture that suggests otherwise is a promise made
 * with somebody's own face. An empty frame says the true thing: the
 * next one is not taken yet.
 *
 * With no photograph at all the left card shows the app's example
 * photograph and says so in its label — a face the app did not name
 * would read as somebody's result.
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
  /** The left card's pill, when its photograph was taken today. */
  today: 'Today',
  /** The left card's pill when the photograph is the app's own. */
  example: 'Example',
  /** The right card's pill, ahead of the date. */
  nextScan: 'Next scan',
  /** What a screen reader hears for the example photograph. Not drawn:
      the reference has no caption under its cards, so neither does
      this — the pill on the card says "Example", and this says it in
      full for somebody who cannot see the pill. */
  emptyBody: 'An example photograph. Your own latest scan takes its place.',
  /** The one claim these cards make. Drawn once, as a small line in the
      footer beside the legal links, and spoken with the cards. */
  onDevice: 'On this device',
  portraitLabel: 'Portrait',
} as const;

/**
 * Which angle to lead with when the set has several.
 *
 * The hairline shot is the one taken facing the camera, so it is the one
 * that reads as a photograph of a person rather than of a scalp — and it
 * is the frame the scan's own report leads with. The sides are next for
 * the same reason. Top and back are last — they are the most useful
 * frames in the record and the least kind ones to open a screen with.
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
 * The photograph for the left card, or null when there is none.
 *
 * Order of preference: the latest session (the newest scan, which is the
 * first entry because sessions are stored newest-first), then the
 * portrait taken during onboarding, then nothing — in which case the
 * screen shows its example photograph, labelled as one.
 */
export function heroFor(data: AppData): PaywallHero | null {
  const latest = latestSession(data);
  const photo = latest ? pickHeroPhoto(latest.photos) : null;
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

/**
 * The pill on the left card. "Today" only when the photograph was taken
 * today; otherwise the day it was taken. The reference labels the card
 * "before" whatever its date, and a card that says "Today" over a
 * photograph from last month would be the same small lie.
 */
export function heroPill(hero: PaywallHero, now: Date = new Date()): string {
  return toDateKey(new Date(hero.takenAt)) === toDateKey(now)
    ? HERO_COPY.today
    : formatDateShort(hero.takenAt);
}

/**
 * The pill on the empty frame: "Next scan · 17 Oct", from the record's
 * own cadence. With no journey there is no date to name, and the frame
 * says only what it is.
 */
export function nextScanLabel(data: AppData): string {
  const due = nextUpdate(data);
  return due ? `${HERO_COPY.nextScan} · ${formatDateShort(due.dueISO)}` : HERO_COPY.nextScan;
}

/**
 * "Hairline · 15 Sept 2026". A fact about the file, nothing more. Not
 * drawn under the cards any more — the reference carries no caption
 * there — but kept as the one place the angle and the date are put into
 * words, so the sweep can hold them to the same rule as the pills.
 */
export function heroCaption(hero: PaywallHero): string {
  return `${hero.label} · ${formatDate(hero.takenAt)}`;
}

/** What a screen reader hears for the pair of cards. */
export function heroAccessibilityLabel(hero: PaywallHero | null, nextLabel: string): string {
  if (!hero) {
    return `${HERO_COPY.emptyBody} Beside it, an empty frame: ${nextLabel}. ${HERO_COPY.onDevice}.`;
  }
  return `Your ${hero.label.toLowerCase()} photograph, taken ${formatDate(hero.takenAt)}. Beside it, an empty frame: ${nextLabel}. ${HERO_COPY.onDevice}.`;
}

/* ------------------------------------------------------------------ *
 * What Premium actually gives you
 *
 * Two rules, and the second one is the one that is easy to lose.
 *
 *   1. Every line is a thing the app does, on a screen that exists in
 *      this repository, and a reviewer with the source open can find it.
 *   2. Every line is a thing the entitlement actually decides. A feature
 *      a free user already has in full does not become a Premium benefit
 *      by being printed under the word Premium.
 *
 * Rule 2 is enforced through exactly two checks, because those are the
 * only two in the app: src/app/hair-scan.tsx sends anyone without the
 * entitlement to this screen the moment they reach for a second scan
 * after the free baseline, and src/app/routine.tsx puts adding to the
 * stack behind gate('buildStack'). Everything below hangs off one of
 * those — directly, or because it needs a second scan, and the scan
 * gate is what a second scan costs.
 *
 * The screen draws THREE of these, as the reference does — the icon row
 * under the headline, see PAYWALL_HIGHLIGHTS. The whole list stays here
 * as the ledger of what the entitlement decides: each highlight has to
 * be one of these lines, so a highlight cannot say anything this list
 * and its tests have not already vouched for.
 *
 * Where each line can be found, and what makes it Premium:
 *
 *   Unlimited scans        src/app/hair-scan.tsx, the free-tier effect
 *                          in `Scanner`. The gate itself. The free
 *                          baseline is the exception, and deliberately
 *                          so.
 *   On-device scan         src/features/assessment/hair-segmenter.ts —
 *                          MediaPipe's hair segmenter, bundled as a
 *                          763 KB tflite file and run through
 *                          react-native-fast-tflite on the phone. It
 *                          reports the hair mask's share of the frame,
 *                          which is AREA. Never density, never
 *                          thickness — a mask cannot see between
 *                          strands, and the word for what it measured
 *                          is the word on the card. Run on the frames
 *                          the scan keeps (features/hair-scan/analysis.ts),
 *                          so it is measured on every scan the gate
 *                          lets through.
 *   Your report            src/app/(tabs)/report.tsx, built by
 *                          features/assessment/engine.ts. The framing
 *                          section is the Premium half: buildReport
 *                          holds it at null on one set and only compares
 *                          once a second exists — matched angles, the
 *                          gap between the dates, and the newest
 *                          hair-area reading beside the one before it.
 *   Side-by-side           src/app/compare.tsx. Two dates, so it needs
 *                          two scans, so it needs the scan gate.
 *   Routine and stack      src/app/routine.tsx — adding to the stack is
 *                          gated on 'buildStack'.
 *   Barcode lookup         src/app/scan-product.tsx, reached from the
 *                          add-a-task form inside that same gate. It
 *                          asks Open Beauty Facts and shows what Open
 *                          Beauty Facts says, which is why the line
 *                          names the database rather than implying the
 *                          app knows something about the bottle.
 *   Kept on this device    the one line here that is not gated, and it
 *                          is not pretending to be: it is a fact about
 *                          what is being paid for — where the
 *                          photographs sit — not a feature unlocked by
 *                          paying. Somebody about to buy a year of photo
 *                          storage should be told that before they tap,
 *                          not after. On this screen it is the small
 *                          lock line in the footer, beside the legal
 *                          links, and it is in what a screen reader
 *                          hears for the two cards. See privacy.tsx.
 *
 * What is deliberately NOT here:
 *
 *   Product suggestions for somebody's hair type. There is no
 *   recommendation engine in this repository — not a model, not a rules
 *   table, not a lookup. Until one exists and ships, it does not go on
 *   the paywall, however well it would sell.
 *
 *   The scan report at the end of the funnel (the HairScanReport that
 *   src/app/hair-scan.tsx shows once a scan is saved). It is a real
 *   screen and a good one, but the first one is FREE: the baseline scan
 *   costs nothing, and its report is what the paywall follows. "Every
 *   reading, for every set" was false and has been struck. What replaced
 *   it is the report tab, which really does read every scan.
 *
 *   Ask Tress, the journal and the history. All real, all shipping, none
 *   gated. Free users have them in full, so charging for them here would
 *   be the same lie in a friendlier font.
 * ------------------------------------------------------------------ */

export type PremiumBenefit = { icon: IconName; title: string; body: string };

export const PREMIUM_BENEFITS: PremiumBenefit[] = [
  {
    icon: 'camera',
    title: 'Unlimited scans',
    body: 'Every scan after the first, kept in the order you took it.',
  },
  {
    icon: 'sparkle',
    /*
     * "AI" is doing honest work here: there is a real neural network in
     * the binary. "On your phone" is the part worth leading with, and
     * "area" is the only thing it is allowed to claim it measured.
     *
     * It says "scan", not "photograph". Every kept frame is measured on
     * the way in (features/hair-scan/analysis.ts), but the reading a
     * person is ever shown is one per scan — the scan's own report for
     * the first, and the report tab's coverage line for each one after.
     * Claiming a reading per photograph would be selling four fifths of
     * a measurement nobody can see.
     */
    title: 'AI scan on your phone',
    body: 'Every scan you take is read for hair area by a model in the app.',
  },
  {
    icon: 'chart',
    /*
     * What the report tab does with a second scan, which is the half of
     * it a free user never reaches. Not "every reading, for every set":
     * the funnel's scan report is the free one. See the note above.
     */
    title: 'Your report, scan after scan',
    body: 'Every new scan is read into your report and set beside the one before.',
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
    icon: 'barcode',
    title: 'Barcode product scanning',
    body: 'Scan a bottle to see what an open database lists for it.',
  },
  {
    icon: 'shield',
    /*
     * The title used to read "Private by design", which is a claim about
     * the whole app made on a line that can only vouch for the
     * photographs. The barcode lookup leaves the phone; a share sheet
     * sends whatever you hand it. So the title now says the same thing
     * the body does, no wider: where the files sit.
     */
    title: 'Kept on this device',
    body: 'Your photographs are kept on this device. The app never uploads them.',
  },
];

/* ------------------------------------------------------------------ *
 * The three highlights
 *
 * The reference puts three icons under its headline and nothing more.
 * These are the three, and each one has to be a line from the ledger
 * above — the test holds them to it — so the row can only ever say what
 * the entitlement decides. The label is the benefit's title, shortened
 * where a column two lines wide needs it; the icon is the benefit's own.
 *
 * Why these three and not the other four: the scan gate, the report the
 * scan gate feeds, and the stack gate — the three places somebody who
 * has not paid actually meets the paywall. The comparison and the
 * barcode lookup are true and remain on the ledger, but they are reached
 * through those three and would be saying the same thing twice.
 * ------------------------------------------------------------------ */

export type PaywallHighlight = {
  /** The title of the PREMIUM_BENEFITS line this stands for. */
  benefit: string;
  /** What the column says. Two short lines at most. */
  label: string;
};

export const PAYWALL_HIGHLIGHTS: PaywallHighlight[] = [
  { benefit: 'Unlimited scans', label: 'Unlimited scans' },
  { benefit: 'Your report, scan after scan', label: 'Your report, scan after scan' },
  { benefit: 'Your routine and stack', label: 'Routine and stack' },
];

export type ResolvedHighlight = { icon: IconName; label: string; body: string };

/**
 * The highlights with their icon and body looked up from the ledger.
 * A highlight that names no ledger line is dropped rather than drawn,
 * and the test makes sure that never happens.
 */
export function highlightBenefits(): ResolvedHighlight[] {
  const out: ResolvedHighlight[] = [];
  for (const h of PAYWALL_HIGHLIGHTS) {
    const benefit = PREMIUM_BENEFITS.find((b) => b.title === h.benefit);
    if (benefit) out.push({ icon: benefit.icon, label: h.label, body: benefit.body });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The plans and the price, in words
 *
 * The price sits on the card that is chosen, and again in the terms
 * under the button that charges it. There is no trial to lead with and
 * therefore no "then" construction — the number on the card is the
 * number on the receipt.
 * ------------------------------------------------------------------ */

/** The tag on the plan worth leading with. Set as the reference sets it. */
export const PLAN_BADGE = 'BEST VALUE';

/**
 * The order the cards are drawn in: the reference lists the short plan
 * first, unselected, and the yearly card with the badge second, already
 * chosen. So the eye reads the price of the month, then lands on the
 * year with the tick in it — a comparison made by position rather than
 * by dimming the card it wants you to pass over. DEFAULT_PLAN in
 * config.ts is what is chosen; this is only where it sits.
 */
export const PLAN_DISPLAY_ORDER: PlanId[] = ['monthly', 'yearly'];

/** "Yearly" / "Monthly". */
export function planName(plan: PlanConfig): string {
  return plan.period === 'year' ? 'Yearly' : 'Monthly';
}

/** "$49.99 a year · about $4.17 a month", or "$7.99 a month". */
export function priceLine(plan: PlanConfig): string {
  return plan.period === 'year'
    ? `${plan.formattedPrice} a year · about ${plan.formattedMonthlyEquivalent} a month`
    : `${plan.formattedPrice} a month`;
}

/**
 * The renewal terms under the button. Every clause the stores require,
 * in one sentence a person can read: what renews, and how to stop it.
 *
 * Apple requires these whether or not there is a trial, so they stay.
 * The price is named again rather than left to the card, because this
 * sentence is the one that has to stand on its own in a review — and
 * standing on its own means naming the period too. "$49.99 unless
 * cancelled" leaves a reader to work out from somewhere else how often
 * that happens, which is the one number in the sentence that decides
 * what it costs them.
 */
export function renewalTerms(plan: PlanConfig): string {
  return `Your subscription renews automatically at ${plan.formattedPrice} a ${plan.period} unless cancelled. Payment is charged to your App Store or Google Play account. Cancel anytime in your account settings.`;
}

export const CTA_COPY = {
  /** The button. It charges the price on the chosen card; the terms
      under it say so in full. */
  subscribe: 'Continue',
  /** Shown briefly after a purchase goes through, before the sheet closes. */
  done: 'Your journey is ready',
  restore: 'Restore',
  restoring: 'Checking your purchases…',
  /**
   * Opens the store's own code-redemption sheet, on iOS only — see
   * provider.tsx. Not shown where there is no sheet to open.
   */
  promoCode: 'I have a promo code',
} as const;

/**
 * The button's label. It takes no plan, because there is only one thing
 * the tap can do — a signature with nowhere to put a trial is a signature
 * that cannot grow one back by accident.
 */
export function ctaLabel(succeeded: boolean): string {
  return succeeded ? CTA_COPY.done : CTA_COPY.subscribe;
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
 * Only the headline changes, and a body appears under it — the one
 * paragraph this screen ever draws. The photograph, the highlights, the
 * plans, the price and the terms are exactly what the first visit
 * showed, because a second ask that quietly moved the price would be a
 * different offer wearing the first one's clothes.
 *
 * The body is two sentences. The first is fixed and says the true thing
 * about leaving: the journey is kept either way. Implying somebody would
 * lose their photographs by not paying would be a threat, and an untrue
 * one. The second is the install's variant — the one framing sentence
 * the arms differ on, see PAYWALL_VARIANTS.
 */
export const SECOND_ASK = {
  headline: 'Before you go.',
  /** The fixed first sentence; the variant's sentence follows it. */
  body: 'Your photographs and notes stay on this device either way — nothing is deleted and nothing is held back from you.',
  accept: 'See Premium again',
  decline: 'Not now',
};

export type PaywallCopy = {
  headline: string;
  /** Null on the first visit: the headline stands alone over the
      benefits, as the reference draws it. */
  body: string | null;
};

/**
 * The top of the screen for this visit: the fixed title on its own, or
 * the second ask — its headline over the reassurance and the install's
 * one framing sentence.
 */
export function paywallCopy(variant: PaywallVariant, secondAsk: boolean): PaywallCopy {
  return secondAsk
    ? { headline: SECOND_ASK.headline, body: `${SECOND_ASK.body} ${variant.body}` }
    : { headline: PAYWALL_TITLE, body: null };
}
