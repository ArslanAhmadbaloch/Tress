/**
 * The Learn library.
 *
 * Editorial content bundled with the app — no backend, no network, so it
 * works offline and there is nothing to fake. Every article is written to
 * the same rule the rest of the product follows: explain what is known,
 * name the uncertainty, and never cross from education into advice about
 * a specific person's treatment.
 *
 * Language rules for anything added here:
 *  - describe what research has observed, not what the reader should do
 *  - "commonly", "for many people", "studies report" — never "you will"
 *  - no dosages, no product recommendations, no claims of guaranteed growth
 *  - anything clinical ends by pointing at a qualified professional
 */

export type LearnCategory =
  | 'basics'
  | 'growth'
  | 'treatments'
  | 'scalp'
  | 'nutrition'
  | 'lifestyle'
  | 'transplants'
  | 'science';

export const CATEGORY_LABELS: Record<LearnCategory, string> = {
  basics: 'Hair Loss Basics',
  growth: 'Hair Growth',
  treatments: 'Treatments',
  scalp: 'Scalp Health',
  nutrition: 'Nutrition',
  lifestyle: 'Lifestyle',
  transplants: 'Hair Transplants',
  science: 'Science',
};

export type ArticleSection = {
  heading: string;
  body: string;
};

export type Article = {
  slug: string;
  title: string;
  category: LearnCategory;
  /** One-line summary shown on cards. */
  standfirst: string;
  readingMinutes: number;
  updated: string;
  featured?: boolean;
  keyTakeaways: string[];
  sections: ArticleSection[];
  /** Plain-language pointers, not a formal bibliography. */
  references?: string[];
};

export const ARTICLES: Article[] = [
  {
    slug: 'why-hair-changes-slowly',
    title: 'Why hair changes so slowly',
    category: 'basics',
    standfirst:
      'Hair grows on a timescale that makes month-to-month judgement unreliable — which is exactly why photographs help.',
    readingMinutes: 5,
    updated: '2026-08-01',
    featured: true,
    keyTakeaways: [
      'Scalp hair typically grows around 1 cm per month',
      'Each follicle runs its own independent cycle',
      'Most people cannot detect gradual change in the mirror',
      'Consistent photographs are more reliable than memory',
    ],
    sections: [
      {
        heading: 'The growth cycle',
        body: "Every follicle moves through three phases independently: a long growing phase, a short transitional phase, and a resting phase that ends when the hair is shed. Because follicles are not synchronised, a healthy scalp is always shedding some hair while growing others. This is why counting hairs in a drain tells you very little on any given day.",
      },
      {
        heading: 'Why the mirror is a poor instrument',
        body: "Change that happens at roughly a centimetre a month, spread across a hundred thousand follicles, is below the threshold most people can perceive day to day. Memory fills the gap with whatever you expect to see — which is why the same head can look better or worse depending on lighting, styling, mood and time of day.",
      },
      {
        heading: 'What consistency buys you',
        body: "A photograph taken from the same angle, in the same light, at the same distance removes almost all of that variance. The comparison then reflects the hair rather than the conditions. This is the entire reason the app asks for five fixed angles rather than letting you photograph freely.",
      },
      {
        heading: 'Setting expectations',
        body: "Research on hair conditions generally reports meaningful change over months, not weeks. If you are documenting a routine, a realistic first review point is somewhere around three to six months, with a fuller picture at a year. Slow does not mean nothing is happening.",
      },
    ],
    references: [
      'General dermatology texts on the hair growth cycle',
      'Reviews of photographic assessment methods in trichology',
    ],
  },
  {
    slug: 'taking-comparable-photos',
    title: 'How to take photographs you can actually compare',
    category: 'basics',
    standfirst:
      'Lighting, angle and distance change an image more than a month of growth does. Controlling them is most of the work.',
    readingMinutes: 4,
    updated: '2026-08-01',
    keyTakeaways: [
      'Same light source, same time of day',
      'Same distance and the same five angles',
      'Dry hair, styled the way you normally wear it',
      'Overlay the previous photo to line the shot up',
    ],
    sections: [
      {
        heading: 'Light is the biggest variable',
        body: "Overhead light exaggerates thinning at the crown; diffuse light from a window flattens it. Neither is wrong, but mixing them across a timeline makes the comparison meaningless. Pick one setup and return to it.",
      },
      {
        heading: 'Wet hair lies',
        body: "Wet or product-heavy hair clumps and reveals more scalp, which reads as loss even when nothing has changed. Photograph dry hair, in its ordinary state, every time.",
      },
      {
        heading: 'Use the overlay',
        body: "During capture the app can show your previous photo at low opacity behind the viewfinder. Lining your head up with that ghost is the single most effective thing you can do for comparability, and it takes a couple of seconds.",
      },
    ],
  },
  {
    slug: 'shedding-versus-loss',
    title: 'Shedding and loss are not the same thing',
    category: 'growth',
    standfirst:
      'Finding hair in the shower is normal. The distinction that matters is whether density is changing over time.',
    readingMinutes: 4,
    updated: '2026-07-20',
    keyTakeaways: [
      'Shedding some hair daily is part of the normal cycle',
      'Shedding is an event; density is a trend',
      'Temporary increases in shedding have many causes',
      'Persistent change in density is worth professional input',
    ],
    sections: [
      {
        heading: 'Normal turnover',
        body: "Because follicles cycle independently, a proportion are always in the resting phase and will release their hair. Seeing hair on a pillow or in a drain is expected and, on its own, is not evidence of anything.",
      },
      {
        heading: 'When shedding increases',
        body: "Episodes of increased shedding are commonly reported after illness, significant stress, major dietary change, and some medical events, and are often temporary. Some people also report a period of increased shedding after starting a new routine. What that means for any individual is not something an app can determine.",
      },
      {
        heading: 'Density is the useful signal',
        body: "Rather than tracking how much you shed on a given day, the more informative question is whether coverage at a given angle is different than it was several months ago. That is a question photographs can answer and a drain cannot.",
      },
      {
        heading: 'When to seek advice',
        body: "Sudden, patchy, or rapidly progressing changes, or shedding alongside other symptoms, are worth raising with a doctor or dermatologist rather than tracking alone.",
      },
    ],
  },
  {
    slug: 'reading-your-own-timeline',
    title: 'Reading your own timeline without fooling yourself',
    category: 'science',
    standfirst:
      'The same biases that make the mirror unreliable also apply to your photographs. A few habits keep the comparison honest.',
    readingMinutes: 6,
    updated: '2026-07-05',
    keyTakeaways: [
      'Compare fixed intervals, not your best day to your worst',
      'Look at one angle at a time',
      'Write the note before you study the photo',
      'Expect noise between adjacent months',
    ],
    sections: [
      {
        heading: 'Choose the interval before you look',
        body: "It is tempting to hunt through a timeline for the pair of photographs that shows the most improvement. Decide the comparison first — baseline against today, or month three against month six — and then look. The app defaults to baseline versus latest for this reason.",
      },
      {
        heading: 'One angle at a time',
        body: "Crown and hairline can move independently. Judging them together produces a vague overall impression that is easy to argue with in either direction. Compare crown to crown, hairline to hairline.",
      },
      {
        heading: 'Adjacent months are mostly noise',
        body: "Month to month, the difference between two photographs is dominated by styling and light rather than biology. Longer intervals have a better signal-to-noise ratio, which is why a timeline becomes more useful the longer you keep it.",
      },
      {
        heading: 'Notes before pictures',
        body: "Writing down how your hair felt this month before you open the comparison keeps the note independent of the image. Over a year, those notes often turn out to be the more interesting record.",
      },
    ],
  },
  {
    slug: 'scalp-basics',
    title: 'What scalp condition does and does not tell you',
    category: 'scalp',
    standfirst:
      'Irritation, flaking and oiliness are common and treatable, and they are a separate question from density.',
    readingMinutes: 4,
    updated: '2026-06-18',
    keyTakeaways: [
      'Scalp comfort and hair density are different measures',
      'Flaking and irritation have many ordinary causes',
      'Persistent irritation is worth a professional opinion',
    ],
    sections: [
      {
        heading: 'Two separate questions',
        body: "People often collapse 'my scalp feels irritated' and 'my hair is thinning' into one worry. They can be related, but frequently are not, and treating them as one question makes both harder to think about.",
      },
      {
        heading: 'What to record',
        body: "If scalp comfort is something you want to follow, note it in your journal alongside the photographs. A written record of when irritation appears and what else changed that month is more useful than trying to read it from an image.",
      },
      {
        heading: 'When it is not just cosmetic',
        body: "Persistent itching, pain, sores, or visible inflammation are reasons to see a doctor or dermatologist. Those are clinical questions and are outside what tracking can answer.",
      },
    ],
  },
  {
    slug: 'consistency-over-intensity',
    title: 'Why consistency beats intensity',
    category: 'lifestyle',
    standfirst:
      'A routine you actually keep for a year tells you more than a perfect one you abandon in March.',
    readingMinutes: 3,
    updated: '2026-06-02',
    keyTakeaways: [
      'Adherence is the variable you control',
      'Gaps make a timeline harder to interpret',
      'A simpler routine is usually a more sustainable one',
    ],
    sections: [
      {
        heading: 'The interpretability problem',
        body: "If a routine is followed irregularly, then whatever the photographs show at month six is hard to attribute to anything. Consistency is not only about outcomes — it is what makes your own record readable later.",
      },
      {
        heading: 'Design for your worst week',
        body: "A routine that only works when everything else in your life is calm will have gaps. People tend to keep the routines that survive a bad week, which usually means fewer items rather than more.",
      },
    ],
  },
];

export const FAQS: { question: string; answer: string }[] = [
  {
    question: 'How often should I take photographs?',
    answer:
      'Monthly suits most people: frequent enough to build a timeline, far enough apart that the difference is not swamped by lighting and styling. You can change the interval in Settings.',
  },
  {
    question: 'Why five angles instead of one?',
    answer:
      'Hairline and crown can change independently, and a single front-on photograph hides the crown entirely. Five fixed angles mean you can compare like with like whichever area you are following.',
  },
  {
    question: 'Does the app analyse my photographs?',
    answer:
      'No. It stores them, organises them by date and angle, and puts them side by side so you can judge for yourself. It does not measure density, count hairs, or assess your hair in any way.',
  },
  {
    question: 'Can Hair Journey tell me if a treatment is working?',
    answer:
      'No. It can show you what your hair looked like at two points in time and what routine you recorded in between. Interpreting that — especially anything medical — is a conversation for a qualified professional.',
  },
  {
    question: 'Where are my photographs stored?',
    answer:
      "On this device, in the app's private storage. In this version there is no account and nothing is uploaded. You can review the total and delete everything from Settings.",
  },
  {
    question: 'What if I miss a month?',
    answer:
      'Nothing breaks. The timeline is dated from your real capture dates, so a gap simply shows as a gap. Take the next set whenever you can.',
  },
];

export function articleBySlug(slug: string): Article | undefined {
  return ARTICLES.find((a) => a.slug === slug);
}

export function searchArticles(query: string): Article[] {
  const q = query.trim().toLowerCase();
  if (!q) return ARTICLES;
  return ARTICLES.filter(
    (a) =>
      a.title.toLowerCase().includes(q) ||
      a.standfirst.toLowerCase().includes(q) ||
      CATEGORY_LABELS[a.category].toLowerCase().includes(q) ||
      a.keyTakeaways.some((k) => k.toLowerCase().includes(q)),
  );
}
