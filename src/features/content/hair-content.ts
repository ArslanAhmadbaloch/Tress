/**
 * Every piece of content that depends on who is holding the phone.
 *
 * One map, read through one hook. The alternative — a `gender === 'female'`
 * beside each image in each screen — spreads a product decision across
 * files that have nothing to do with it, and guarantees that the day a
 * seventh reference photograph is added, two screens will disagree about
 * whether it exists.
 *
 * What varies is deliberately small: the example photographs, and the
 * sentence beside each one. The camera, the storage, the comparison, the
 * five angles and their names are the same for everybody, because they
 * are the same act.
 *
 * The male set is the one the app shipped with and is reproduced here
 * unchanged, down to its wording — anybody already mid-journey should see
 * exactly what they saw yesterday.
 */

import { ANGLE_GUIDANCE, type Angle, type Gender } from '@/types/domain';

export type AngleContent = {
  /** Example of the framing, never mixed into the user's own photos. */
  example: number;
  instruction: string;
  tips: string[];
};

export type HairContent = {
  /** The before-and-after example on the Home progress card. */
  progress: { before: number; after: number };
  /** The face at the centre of the capture intro's angle ring. */
  portrait: number;
  angles: Record<Angle, AngleContent>;
};

/* -------------------------------- male --------------------------------- */

const MALE: HairContent = {
  progress: {
    before: require('@/assets/images/example-before.jpg'),
    after: require('@/assets/images/example-after.jpg'),
  },
  portrait: require('@/assets/images/angle-portrait.jpg'),
  angles: {
    top: { example: require('@/assets/images/angle-top.jpg'), ...ANGLE_GUIDANCE.top },
    leftTemple: {
      example: require('@/assets/images/angle-left.jpg'),
      ...ANGLE_GUIDANCE.leftTemple,
    },
    rightTemple: {
      example: require('@/assets/images/angle-right.jpg'),
      ...ANGLE_GUIDANCE.rightTemple,
    },
    crown: { example: require('@/assets/images/angle-crown.jpg'), ...ANGLE_GUIDANCE.crown },
    front: { example: require('@/assets/images/angle-front.jpg'), ...ANGLE_GUIDANCE.front },
  },
};

/* ------------------------------- female -------------------------------- */

/**
 * The same five angles, framed for longer hair.
 *
 * The wording differs only where the act does. "Part" and "length" matter
 * to somebody with hair down their back and mean nothing on a crown shot,
 * and the instruction is the one place that is worth saying. Nothing here
 * claims the app can find anything, because it cannot: these describe how
 * to take a photograph you will be able to compare later, which is the
 * whole of what the app does.
 */
const FEMALE: HairContent = {
  progress: {
    before: require('@/assets/images/female-example-before.jpg'),
    after: require('@/assets/images/female-example-after.jpg'),
  },
  portrait: require('@/assets/images/female-portrait.jpg'),
  angles: {
    top: {
      example: require('@/assets/images/female-angle-top.jpg'),
      instruction:
        'Capture the top of your hair so you can track your part and density over time.',
      tips: [
        'Camera directly overhead',
        'Part your hair as you normally wear it',
        'Even lighting, no harsh shadow',
      ],
    },
    leftTemple: {
      example: require('@/assets/images/female-angle-left.jpg'),
      instruction: 'Turn slightly to show your left side and temple.',
      tips: ['Rotate about 45°', 'Keep your chin level', 'Same side every session'],
    },
    rightTemple: {
      example: require('@/assets/images/female-angle-right.jpg'),
      instruction: 'Turn slightly to show your right side and temple.',
      tips: ['Rotate about 45°', 'Keep your chin level', 'Mirror your left angle'],
    },
    crown: {
      example: require('@/assets/images/female-angle-crown.jpg'),
      instruction: 'Capture the back to track overall length, density and coverage.',
      tips: [
        'Camera behind you, held steady',
        'Hair down and in its usual place',
        'Same distance each time',
      ],
    },
    front: {
      example: require('@/assets/images/female-angle-front.jpg'),
      instruction:
        'Take a closer photo of your hairline and scalp so you can compare subtle changes over time.',
      tips: [
        'Separate your hair along your part',
        'Hold the phone close and steady',
        'Same part, same spot each time',
      ],
    },
  },
};

const CONTENT: Record<Gender, HairContent> = { male: MALE, female: FEMALE };

/** The reference set for a profile. Absent gender reads as male. */
export function hairContent(gender: Gender | undefined): HairContent {
  return CONTENT[gender ?? 'male'];
}
