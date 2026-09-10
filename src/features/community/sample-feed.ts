/**
 * TEMPORARY — placeholder community content.
 *
 * The community is backend-shaped: real posts arrive with Supabase in
 * the backend phase (auth, RLS, storage-backed photos). Until then this
 * file supplies structurally-correct sample rows so the feed layout,
 * filters and interaction states can be built and reviewed.
 *
 * Rules while this exists:
 *  - the UI must badge this content as sample data, never pass it off
 *    as real users;
 *  - likes and saves stay local to the session and are not persisted;
 *  - no photo URIs, because inventing before/after hair photos of people
 *    who don't exist would be exactly the kind of fake the product must
 *    avoid. Posts render a labelled placeholder instead.
 *
 * Delete this module when `community` moves to Supabase.
 */

import type { CommunityFilter, CommunityPost } from '@/types/domain';

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export const SAMPLE_POSTS: CommunityPost[] = [
  {
    id: 'sample_1',
    author: { id: 'a1', displayName: 'Sam', journeyMonths: 7 },
    createdAt: daysAgo(2),
    caption:
      'Started noticing less shedding around month 4. Density at the temples is where I see the biggest change.',
    beforeLabel: 'Month 0',
    afterLabel: 'Month 7',
    angle: 'leftTemple',
    trackingAreas: ['hairline', 'shedding'],
    routineSummary: 'Topical routine, daily · 7 months',
    likeCount: 128,
    commentCount: 24,
    likedByMe: false,
    savedByMe: false,
  },
  {
    id: 'sample_2',
    author: { id: 'a2', displayName: 'Priya', journeyMonths: 12 },
    createdAt: daysAgo(5),
    caption:
      'One year documented. Honestly the timeline is what kept me consistent — I could not tell month to month.',
    beforeLabel: 'Baseline',
    afterLabel: 'Year 1',
    angle: 'top',
    trackingAreas: ['diffuseThinning', 'density'],
    routineSummary: 'Supplements + hair care · 12 months',
    likeCount: 342,
    commentCount: 51,
    likedByMe: false,
    savedByMe: false,
  },
  {
    id: 'sample_3',
    author: { id: 'a3', displayName: 'Marcus', journeyMonths: 2 },
    createdAt: daysAgo(9),
    caption:
      'Two months in. Not expecting much yet, mostly posting so I actually keep taking the photos.',
    beforeLabel: 'Month 0',
    afterLabel: 'Month 2',
    angle: 'crown',
    trackingAreas: ['crown'],
    likeCount: 47,
    commentCount: 12,
    likedByMe: false,
    savedByMe: false,
  },
  {
    id: 'sample_4',
    author: { id: 'a4', displayName: 'Dani', journeyMonths: 9 },
    createdAt: daysAgo(14),
    caption:
      'Transplant recovery, month 9. The shedding phase around month 2 was rough and nobody warned me.',
    beforeLabel: 'Month 0',
    afterLabel: 'Month 9',
    angle: 'front',
    trackingAreas: ['transplantRecovery', 'hairline'],
    routineSummary: 'Post-procedure care · 9 months',
    likeCount: 219,
    commentCount: 63,
    likedByMe: false,
    savedByMe: false,
  },
];

export const FILTERS: { value: CommunityFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'justStarting', label: 'Just Starting' },
  { value: 'month1to3', label: 'Month 1–3' },
  { value: 'month3to6', label: 'Month 3–6' },
  { value: 'month6to12', label: 'Month 6–12' },
  { value: 'yearPlus', label: '1+ Year' },
  { value: 'transplants', label: 'Transplants' },
  { value: 'hairline', label: 'Hairline' },
  { value: 'crown', label: 'Crown' },
  { value: 'diffuse', label: 'Diffuse' },
];

export function matchesFilter(post: CommunityPost, filter: CommunityFilter): boolean {
  const m = post.author.journeyMonths;

  switch (filter) {
    case 'all':
      return true;
    case 'justStarting':
      return m < 1;
    case 'month1to3':
      return m >= 1 && m < 3;
    case 'month3to6':
      return m >= 3 && m < 6;
    case 'month6to12':
      return m >= 6 && m < 12;
    case 'yearPlus':
      return m >= 12;
    case 'transplants':
      return post.trackingAreas.includes('transplantRecovery');
    case 'hairline':
      return post.trackingAreas.includes('hairline');
    case 'crown':
      return post.trackingAreas.includes('crown');
    case 'diffuse':
      return post.trackingAreas.includes('diffuseThinning');
    case 'womens':
      return false;
    default:
      return true;
  }
}
