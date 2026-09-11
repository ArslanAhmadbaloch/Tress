import type { Angle } from '@/types/domain';

/**
 * One sample photograph per angle, from the design kit.
 *
 * Shown only as examples of framing on the capture intro — always labelled
 * as an example, never mixed into the user's own timeline.
 */
export const ANGLE_EXAMPLES: Record<Angle, number> = {
  top: require('@/assets/images/example-after.jpg'),
  leftTemple: require('@/assets/images/angle-left.jpg'),
  rightTemple: require('@/assets/images/angle-right.jpg'),
  crown: require('@/assets/images/angle-crown.jpg'),
  front: require('@/assets/images/example-before.jpg'),
};
