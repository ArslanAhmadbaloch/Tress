/**
 * The three things the funnel gives back.
 *
 * Every claim here is traceable to an article already in the Learn library,
 * which carries the citations — so each card ends with a link to the piece
 * it came from, and nothing is asserted here that the app is not prepared
 * to show its working for.
 *
 * Three things were deliberately left out.
 *
 * No urgency. The library's own material notes that a few kinds of hair
 * loss are time-sensitive, and that is exactly the sentence a funnel would
 * reach for to frighten somebody into subscribing. It is not here. These
 * are people who are already worried; the product's job is to leave them
 * steadier, not to trade on the worry.
 *
 * No claim that photographs are objective. The library is careful about
 * this: dermatologists rating the same photographs have disagreed with each
 * other and with themselves, and month to month a pair of photos is
 * dominated by light and styling rather than biology. What photographs beat
 * is memory, over long intervals, under consistent conditions — which is
 * what the copy says and all it says.
 *
 * No suggestion that the app helps anybody work out their own cause or
 * their own treatment. It cannot. Identifying a cause belongs to a doctor,
 * and the card says so plainly.
 */

export type Fact = {
  eyebrow: string;
  headline: string;
  body: string[];
  /** The line that turns the fact into what the app does about it. */
  footnote: string;
  /** How it is attributed on screen. */
  source: string;
  /** The Learn article it came from, with the citations. */
  slug: string;
  cta: string;
};

export const FACTS: Record<'gradual' | 'feelings' | 'cause', Fact> = {
  gradual: {
    eyebrow: 'Worth knowing',
    headline: 'Hair changes are easy to miss.',
    body: [
      'Hair grows about a centimetre a month, across roughly a hundred thousand follicles that are never in step with each other. Change spread that thin is below what anyone can see from one day to the next — which is why it so often seems to arrive all at once.',
      'Over months, memory and the mirror are not much better. Photographs taken from the same angles, in similar light, are a steadier record than either. They cannot tell you why your hair is changing — but they can show you that it did.',
    ],
    footnote: 'Same angles. Consistent light. Your own timeline.',
    source: 'From our guide on why treatments take months to judge.',
    slug: 'treatments-why-treatments-take-months-to-judge',
    cta: 'Continue',
  },

  feelings: {
    eyebrow: 'Worth knowing',
    headline: 'You’re not imagining the weight of it.',
    body: [
      'Hair is tied closely to how people see themselves, and research on hair loss describes real effects on confidence, mood and quality of life.',
      'It does not track severity. Hair loss that looks mild to someone else can matter a great deal to the person living with it, and how much it affects you is shaped by your age, your circumstances and what you expect of yourself. Your experience of it is the one that counts.',
    ],
    footnote: 'You don’t have to work all of this out at once.',
    source: 'From our guide on the emotional weight of hair loss.',
    slug: 'lifestyle-emotional-impact-and-support',
    cta: 'Continue',
  },

  cause: {
    eyebrow: 'Worth knowing',
    headline: 'Hair changes for many different reasons.',
    body: [
      'The American Academy of Dermatology lists eighteen distinct causes, from inherited pattern loss to thyroid conditions, low iron, scalp infections and medicines. Several of them look alike at first glance, which is why an accurate diagnosis is what stops people spending years on something that was never going to help.',
      'That diagnosis belongs to a doctor — a GP or a dermatologist — and this app does not attempt it. What it can do is make sure that when you do go, you arrive with a record instead of an impression.',
    ],
    footnote: 'Your job isn’t to have the answers. It’s to start the record.',
    source: 'From our guide on when hair loss is worth a professional look.',
    slug: 'basics-when-to-see-a-dermatologist',
    cta: 'Continue',
  },
};
