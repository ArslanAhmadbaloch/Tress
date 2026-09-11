import type { Angle } from '@/types/domain';

/**
 * One example photograph per angle, from the design kit's Angles set:
 * the same model, light and backdrop in all five, so the set reads as one
 * consistent session — which is exactly what the screen is asking of the
 * user.
 *
 * Shown only as examples of framing on the capture intro, always labelled
 * as examples, and never mixed into the user's own timeline.
 */
export const ANGLE_EXAMPLES: Record<Angle, number> = {
  top: require('@/assets/images/angle-top.jpg'),
  leftTemple: require('@/assets/images/angle-left.jpg'),
  rightTemple: require('@/assets/images/angle-right.jpg'),
  crown: require('@/assets/images/angle-crown.jpg'),
  front: require('@/assets/images/angle-front.jpg'),
};

/** The front-facing portrait at the centre of the angle ring. */
export const CAPTURE_PORTRAIT: number = require('@/assets/images/angle-portrait.jpg');
