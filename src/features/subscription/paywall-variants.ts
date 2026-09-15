/**
 * Which paywall somebody sees, and why there is more than one.
 *
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

/**
 * The one second ask, offered when somebody closes the paywall.
 *
 * Once per install, never again — it is recorded the first time it is
 * shown rather than the first time it is accepted, so declining twice is
 * not possible. A sheet that reappears on every dismissal is the pattern
 * that gets apps reported, and it teaches people to stop opening the app
 * rather than to subscribe.
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
