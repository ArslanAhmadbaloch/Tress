/**
 * The hairstyle catalogue: forty cuts, each tagged with the lengths it
 * is cut at, the hair types it is cut on, and who the illustration is
 * drawn for.
 *
 * ── What an entry is ──────────────────────────────────────────────────
 * A haircut. The name is the name a stylist would use; the note is one
 * line about the cut itself — what it is and what it takes to keep —
 * and nothing about the person reading it. No entry says a cut suits
 * anybody, makes hair look any way, or does anything for it: a cut is
 * a styling suggestion for a hair type and a length, and a stylist
 * decides the rest. The sweep in scripts/test/hairstyles.test.ts holds
 * every name and note to that.
 *
 * ── The tags ──────────────────────────────────────────────────────────
 * `lengths` is where the cut lives; the funnel never asks length, so
 * the picker ignores it and the screen prints it as a label. `hairTypes`
 * is the funnel's own vocabulary (straight, wavy, curly, coily), and is
 * the one tag the picker filters on. `gender` chooses the illustration
 * set: 'any' is a cut the catalogue draws for everybody, and a cut
 * whose drawing is plainly one set's is tagged for that set even where
 * the cut itself is worn by anybody (the undercut). `traits` are the
 * picker's tie-breakers — a cut with volume kept on top, a cut that
 * needs little handling, a style that pulls at the root — and each is a
 * plain fact about the cut, cited where a source says so. Every trait
 * declared here is one the picker weighs (picker.ts, `traitWeights`).
 *
 * ── The pictures ──────────────────────────────────────────────────────
 * Flat illustrations on a featureless head, one per entry, generated to
 * one prompt so they read as a set: cream ground, off-white head, sage
 * hair, no face, three-quarter view, one soft shadow. Each drawing was
 * checked against its own entry — the cut it shows is the cut the note
 * describes, at a length the tags allow — and redrawn where it was not.
 * 512 px JPEGs (the art is opaque, and forty PNGs at that size ran past
 * the asset budget), bundled with the app, so nothing here is fetched.
 *
 * Pure: no React, nothing native. Loaded by `node --test`, where
 * `require` is a stand-in that returns the path (scripts/test/register.mjs).
 */

import type { HairType } from '@/types/domain';

export type HairLength = 'short' | 'medium' | 'long';

export type HairstyleGender = 'male' | 'female' | 'any';

/**
 * What a cut is like to live with, as the picker reads it.
 *
 *   volumeOnTop      length and shape are kept at the crown and front.
 *   lowManipulation  worn as it dries; little daily combing, tying or
 *                    heat.
 *   tension          held under pull at the root — tight braids, sleek
 *                    ties, knots. The American Academy of Dermatology
 *                    lists hairstyles that pull as a cause of traction
 *                    alopecia (aad.org/public/diseases/hair-loss/causes/hairstyles),
 *                    so the picker sets these back where the record
 *                    mentions breakage, shedding or scalp showing.
 */
export type HairstyleTrait = 'volumeOnTop' | 'lowManipulation' | 'tension';

export type Hairstyle = {
  id: string;
  name: string;
  /** A bundled illustration: `require()`'s asset id. */
  image: number;
  lengths: HairLength[];
  hairTypes: HairType[];
  gender: HairstyleGender;
  /** One honest line: what the cut is, what it needs. Never what it does for anybody. */
  note: string;
  traits: HairstyleTrait[];
};

const ALL_TYPES: HairType[] = ['straight', 'wavy', 'curly', 'coily'];

/**
 * In catalogue order, which is the order ties are broken in: shorter
 * cuts before longer, the men's set, the women's set, then the cuts
 * drawn for everybody. The picker's scores decide first; this order
 * decides between equals, so the same record always gets the same list.
 */
export const HAIRSTYLE_CATALOGUE: readonly Hairstyle[] = Object.freeze([
  /* ------------------------------ men's set ------------------------------ */
  {
    id: 'crew-cut',
    name: 'Crew cut',
    image: require('@/assets/images/hairstyles/crew-cut.jpg'),
    lengths: ['short'],
    hairTypes: ['straight', 'wavy'],
    gender: 'male',
    note: 'Short at the sides and a little longer on top. A trim every three to four weeks keeps the shape.',
    traits: ['volumeOnTop', 'lowManipulation'],
  },
  {
    id: 'french-crop',
    name: 'French crop',
    image: require('@/assets/images/hairstyles/french-crop.jpg'),
    lengths: ['short'],
    hairTypes: ['straight', 'wavy', 'curly'],
    gender: 'male',
    note: 'A short textured top with a blunt fringe pulled forward. Styled with a little matte product, or not at all.',
    traits: ['volumeOnTop', 'lowManipulation'],
  },
  {
    id: 'textured-crop',
    name: 'Textured crop',
    image: require('@/assets/images/hairstyles/textured-crop.jpg'),
    lengths: ['short'],
    hairTypes: ['wavy', 'curly'],
    gender: 'male',
    note: 'Point-cut on top for a choppy finish, short at the sides. Takes a fingerful of paste and a minute in the morning.',
    traits: ['volumeOnTop', 'lowManipulation'],
  },
  {
    id: 'taper-fade',
    name: 'Taper fade',
    image: require('@/assets/images/hairstyles/taper-fade.jpg'),
    lengths: ['short'],
    hairTypes: ALL_TYPES,
    gender: 'male',
    note: 'The sides fade shorter toward the ear and neck, with length kept on top. The fade grows out in two to three weeks.',
    traits: ['volumeOnTop'],
  },
  {
    id: 'side-part',
    name: 'Side part',
    image: require('@/assets/images/hairstyles/side-part.jpg'),
    lengths: ['short', 'medium'],
    hairTypes: ['straight', 'wavy'],
    gender: 'male',
    note: 'Combed to one side from a clean parting. Needs a comb, a light product and a trim every month or so.',
    traits: [],
  },
  {
    id: 'slick-back',
    name: 'Slick back',
    image: require('@/assets/images/hairstyles/slick-back.jpg'),
    lengths: ['medium'],
    hairTypes: ['straight', 'wavy'],
    gender: 'male',
    note: 'Medium length combed straight back and held with pomade or gel. Styled daily; the sides can be left longer or tapered.',
    traits: [],
  },
  {
    id: 'quiff',
    name: 'Quiff',
    image: require('@/assets/images/hairstyles/quiff.jpg'),
    lengths: ['short', 'medium'],
    hairTypes: ['straight', 'wavy'],
    gender: 'male',
    note: 'The front is swept up and back with the sides kept shorter. Usually blow-dried into place, then set with product.',
    traits: ['volumeOnTop'],
  },
  {
    id: 'pompadour',
    name: 'Pompadour',
    image: require('@/assets/images/hairstyles/pompadour.jpg'),
    lengths: ['medium'],
    hairTypes: ['straight', 'wavy'],
    gender: 'male',
    note: 'Height at the front, swept up and back from the forehead over short sides. A daily style with a dryer and a firm product.',
    traits: ['volumeOnTop'],
  },
  {
    id: 'curtain',
    name: 'Curtains',
    image: require('@/assets/images/hairstyles/curtain.jpg'),
    lengths: ['medium'],
    hairTypes: ['straight', 'wavy'],
    gender: 'male',
    note: 'Parted in the middle and left to fall to either side of the forehead. Air-dried or lightly blow-dried; trimmed every six to eight weeks.',
    traits: ['lowManipulation'],
  },
  {
    id: 'medium-flow',
    name: 'Medium flow',
    image: require('@/assets/images/hairstyles/medium-flow.jpg'),
    lengths: ['medium'],
    hairTypes: ['wavy', 'curly'],
    gender: 'male',
    note: 'Grown to the ears and swept back off the face, left to its own wave. Little styling; a trim every couple of months keeps the ends tidy.',
    traits: ['lowManipulation'],
  },
  {
    id: 'undercut',
    name: 'Undercut',
    image: require('@/assets/images/hairstyles/undercut.jpg'),
    lengths: ['short', 'medium'],
    hairTypes: ['straight', 'wavy', 'curly'],
    // Worn by anybody, but the drawing is the men's set's (swept back over
    // clipped sides), so it is tagged for that set and not for everybody.
    gender: 'male',
    note: 'Length on top with the sides and back clipped close, with no blend between. The clipped part needs doing every few weeks.',
    traits: ['volumeOnTop'],
  },
  {
    id: 'man-bun',
    name: 'Man bun',
    image: require('@/assets/images/hairstyles/man-bun.jpg'),
    lengths: ['long'],
    hairTypes: ['straight', 'wavy', 'curly'],
    gender: 'male',
    note: 'Long hair tied into a bun at the crown or nape. Takes a year or more of growing; a loose tie is easier on the hairline than a tight one.',
    traits: ['tension'],
  },
  {
    id: 'curly-top-fade',
    name: 'Curly top fade',
    image: require('@/assets/images/hairstyles/curly-top-fade.jpg'),
    lengths: ['short'],
    hairTypes: ['curly', 'coily'],
    gender: 'male',
    note: 'Curls left to their own shape on top over faded sides. A curl cream on damp hair and a fade every few weeks.',
    traits: ['volumeOnTop', 'lowManipulation'],
  },
  {
    id: 'high-top',
    name: 'High-top',
    image: require('@/assets/images/hairstyles/high-top.jpg'),
    lengths: ['short', 'medium'],
    hairTypes: ['coily'],
    gender: 'male',
    note: 'Cut tall and squared on top with short sides. Shaped with a pick, and lined up at the barber every two to three weeks.',
    traits: ['volumeOnTop'],
  },

  /* ----------------------------- women's set ----------------------------- */
  {
    id: 'pixie',
    name: 'Pixie',
    image: require('@/assets/images/hairstyles/pixie.jpg'),
    lengths: ['short'],
    hairTypes: ['straight', 'wavy'],
    gender: 'female',
    note: 'Cropped close at the back and sides with a soft fringe. Quick to style, and cut every four to six weeks to hold its line.',
    traits: ['volumeOnTop', 'lowManipulation'],
  },
  {
    id: 'bixie',
    name: 'Bixie',
    image: require('@/assets/images/hairstyles/bixie.jpg'),
    lengths: ['short'],
    hairTypes: ['straight', 'wavy', 'curly'],
    gender: 'female',
    note: 'Between a bob and a pixie: cropped layers on top with soft length left at the nape. Air-dries with a little texture product.',
    traits: ['volumeOnTop', 'lowManipulation'],
  },
  {
    id: 'blunt-bob',
    name: 'Blunt bob',
    image: require('@/assets/images/hairstyles/blunt-bob.jpg'),
    lengths: ['short'],
    hairTypes: ['straight'],
    gender: 'female',
    note: 'Cut in one even line at the jaw, no layers. Usually smoothed with a round brush or flat iron, and trimmed every six weeks to stay sharp.',
    traits: [],
  },
  {
    id: 'french-bob',
    name: 'French bob',
    image: require('@/assets/images/hairstyles/french-bob.jpg'),
    lengths: ['short'],
    hairTypes: ['straight', 'wavy'],
    gender: 'female',
    note: 'A chin-length bob with a short fringe. Worn a little undone, so it air-dries with a light cream and needs the fringe trimmed often.',
    traits: ['lowManipulation'],
  },
  {
    id: 'curly-bob',
    name: 'Curly bob',
    image: require('@/assets/images/hairstyles/curly-bob.jpg'),
    lengths: ['short', 'medium'],
    hairTypes: ['curly'],
    gender: 'female',
    note: 'Cut to the jaw with the curl pattern left in. Styled wet with a curl cream and left to dry; cut dry so the curls sit where they land.',
    traits: ['lowManipulation'],
  },
  {
    id: 'lob',
    name: 'Lob',
    image: require('@/assets/images/hairstyles/lob.jpg'),
    lengths: ['medium'],
    hairTypes: ['straight', 'wavy'],
    gender: 'female',
    note: 'A long bob that ends just above the shoulders. Air-dries or blow-dries in a few minutes; a trim every eight weeks keeps the line.',
    traits: ['lowManipulation'],
  },
  {
    id: 'shoulder-layers',
    name: 'Shoulder-length layers',
    image: require('@/assets/images/hairstyles/shoulder-layers.jpg'),
    lengths: ['medium'],
    hairTypes: ['straight', 'wavy', 'curly'],
    gender: 'female',
    note: 'To the shoulders with soft layers through the ends. Styled loose or tied; trimmed every couple of months.',
    traits: [],
  },
  {
    id: 'shag',
    name: 'Shag',
    image: require('@/assets/images/hairstyles/shag.jpg'),
    lengths: ['medium'],
    hairTypes: ['wavy', 'curly'],
    gender: 'female',
    note: 'Choppy layers from the crown down with a fringe. Worn tousled: a texture spray on damp hair, and no brushing once it is dry.',
    traits: ['volumeOnTop', 'lowManipulation'],
  },
  {
    id: 'wolf-cut',
    name: 'Wolf cut',
    image: require('@/assets/images/hairstyles/wolf-cut.jpg'),
    lengths: ['medium', 'long'],
    hairTypes: ['wavy', 'curly'],
    gender: 'female',
    note: 'A heavily layered crown over long, wispy lengths. Air-dried with a little product; the short layers need trimming more often than the length.',
    traits: ['volumeOnTop', 'lowManipulation'],
  },
  {
    id: 'curtain-bangs',
    name: 'Curtain bangs',
    image: require('@/assets/images/hairstyles/curtain-bangs.jpg'),
    lengths: ['medium', 'long'],
    hairTypes: ['straight', 'wavy'],
    gender: 'female',
    note: 'A fringe parted in the middle and swept to each side, with the rest left long. The fringe is blow-dried and trimmed every three to four weeks.',
    traits: [],
  },
  {
    id: 'long-layers',
    name: 'Long layers',
    image: require('@/assets/images/hairstyles/long-layers.jpg'),
    lengths: ['long'],
    hairTypes: ['straight', 'wavy'],
    gender: 'female',
    note: 'Past the shoulders with long layers cut through the lengths. Worn loose or tied; a trim every two to three months keeps the ends.',
    traits: [],
  },
  {
    id: 'long-blunt',
    name: 'Long blunt',
    image: require('@/assets/images/hairstyles/long-blunt.jpg'),
    lengths: ['long'],
    hairTypes: ['straight'],
    gender: 'female',
    note: 'Long and cut in one line at the chest, no layers. Smoothed with a brush and dryer; the line is trimmed every couple of months.',
    traits: [],
  },
  {
    id: 'beach-waves',
    name: 'Beach waves',
    image: require('@/assets/images/hairstyles/beach-waves.jpg'),
    lengths: ['medium', 'long'],
    hairTypes: ['wavy'],
    gender: 'female',
    note: 'Loose, tousled waves left to their own pattern. Scrunched with a salt spray and air-dried; a wand makes the wave when the hair does not.',
    traits: ['lowManipulation'],
  },
  {
    id: 'long-curls',
    name: 'Long curls',
    image: require('@/assets/images/hairstyles/long-curls.jpg'),
    lengths: ['long'],
    hairTypes: ['curly'],
    gender: 'female',
    note: 'Curls worn long, past the shoulders, with the pattern left in. Detangled wet with conditioner, styled with a cream and left to dry.',
    traits: ['lowManipulation'],
  },
  {
    id: 'half-up',
    name: 'Half-up',
    image: require('@/assets/images/hairstyles/half-up.jpg'),
    lengths: ['long'],
    hairTypes: ['straight', 'wavy', 'curly'],
    gender: 'female',
    note: 'The top section tied back with the rest left down. A soft tie is kinder to the hairline than an elastic pulled tight.',
    traits: [],
  },
  {
    id: 'sleek-ponytail',
    name: 'Sleek ponytail',
    image: require('@/assets/images/hairstyles/sleek-ponytail.jpg'),
    lengths: ['medium', 'long'],
    hairTypes: ['straight', 'wavy'],
    gender: 'female',
    note: 'Pulled back smooth and tied high. Brushed flat with gel or a smoothing cream; worn tight every day, it pulls at the hairline.',
    traits: ['tension'],
  },
  {
    id: 'high-puff',
    name: 'High puff',
    image: require('@/assets/images/hairstyles/high-puff.jpg'),
    lengths: ['medium', 'long'],
    hairTypes: ['coily', 'curly'],
    gender: 'female',
    note: 'Coils gathered up into a rounded puff at the top of the head. Held with a soft band; a tight one pulls at the edges.',
    traits: ['tension'],
  },
  {
    id: 'bantu-knots',
    name: 'Bantu knots',
    image: require('@/assets/images/hairstyles/bantu-knots.jpg'),
    lengths: ['short', 'medium'],
    hairTypes: ['coily', 'curly'],
    gender: 'female',
    note: 'Sections twisted and coiled into small knots across the head. Set on damp hair and worn for a few days, or unravelled for a curl.',
    traits: ['tension'],
  },

  /* ------------------------- drawn for everybody ------------------------- */
  {
    id: 'buzz-cut',
    name: 'Buzz cut',
    image: require('@/assets/images/hairstyles/buzz-cut.jpg'),
    lengths: ['short'],
    hairTypes: ALL_TYPES,
    gender: 'any',
    note: 'Clipped to one short length all over. No styling at all; a pass with clippers every two to three weeks keeps it even.',
    traits: ['lowManipulation'],
  },
  {
    id: 'classic-taper',
    name: 'Classic taper',
    image: require('@/assets/images/hairstyles/classic-taper.jpg'),
    lengths: ['short'],
    hairTypes: ALL_TYPES,
    gender: 'any',
    note: 'Neat and short, trimmed closer around the ears and neckline. Combs into place with little product and holds for about a month.',
    traits: ['lowManipulation'],
  },
  {
    id: 'tapered-afro',
    name: 'Tapered afro',
    image: require('@/assets/images/hairstyles/tapered-afro.jpg'),
    lengths: ['short', 'medium'],
    hairTypes: ['coily'],
    gender: 'any',
    note: 'A rounded afro tapered shorter at the sides and nape. Picked out from the roots, moisturised often, and shaped up every few weeks.',
    traits: ['volumeOnTop', 'lowManipulation'],
  },
  {
    id: 'wash-and-go',
    name: 'Wash-and-go',
    image: require('@/assets/images/hairstyles/wash-and-go.jpg'),
    lengths: ['short', 'medium'],
    hairTypes: ['curly', 'coily'],
    gender: 'any',
    note: 'Curls defined on wash day with a leave-in and gel, then left alone as they dry. Refreshed with water between washes.',
    traits: ['lowManipulation'],
  },
  {
    id: 'twist-out',
    name: 'Twist-out',
    image: require('@/assets/images/hairstyles/twist-out.jpg'),
    lengths: ['medium'],
    hairTypes: ['curly', 'coily'],
    gender: 'any',
    note: 'Two-strand twists set on damp hair, unravelled once dry for a defined, springy pattern. Set at night; lasts a few days.',
    traits: ['lowManipulation'],
  },
  {
    id: 'cornrows',
    name: 'Cornrows',
    image: require('@/assets/images/hairstyles/cornrows.jpg'),
    lengths: ['short', 'medium'],
    hairTypes: ['curly', 'coily'],
    gender: 'any',
    note: 'Braided flat to the scalp in rows. Worn for a week or two; braided loosely at the hairline, since tight rows pull at the edges.',
    traits: ['tension'],
  },
  {
    id: 'box-braids',
    name: 'Box braids',
    image: require('@/assets/images/hairstyles/box-braids.jpg'),
    lengths: ['long'],
    hairTypes: ['curly', 'coily'],
    gender: 'any',
    note: 'Sectioned into squares and braided long, often with added hair. Installed over hours and worn for weeks; heavy or tight braids pull at the root.',
    traits: ['tension'],
  },
  {
    id: 'locs',
    name: 'Locs',
    image: require('@/assets/images/hairstyles/locs.jpg'),
    lengths: ['medium', 'long'],
    hairTypes: ['coily', 'curly'],
    gender: 'any',
    note: 'Sections left to lock into rope-like strands over months. Retwisted at the root every month or two; a long commitment to grow and to keep.',
    traits: ['lowManipulation'],
  },
]);
