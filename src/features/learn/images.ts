import type { Article, LearnCategory } from './library';

/**
 * Photographs for the Learn library, from the design kit.
 *
 * Matched to what a topic is about: the thinning crown for hair-loss
 * basics, a full top view for growth, the hairline for the scalp, the back
 * of the head (the donor area) for transplants. Topics without a fitting
 * photograph get a drawn cover instead of an unrelated stock image.
 */
const CATEGORY_IMAGES: Partial<Record<LearnCategory, number>> = {
  basics: require('@/assets/images/example-before.jpg'),
  growth: require('@/assets/images/angle-top.jpg'),
  scalp: require('@/assets/images/angle-front.jpg'),
  transplants: require('@/assets/images/angle-crown.jpg'),
};

/** Individual pieces whose subject has a closer match than their topic's. */
const ARTICLE_IMAGES: Record<string, number> = {
  'why-hair-changes-slowly': require('@/assets/images/angle-crown.jpg'),
  'taking-comparable-photos': require('@/assets/images/angle-portrait.jpg'),
  'reading-your-own-timeline': require('@/assets/images/example-after.jpg'),
  'consistency-over-intensity': require('@/assets/images/angle-top.jpg'),
  'transplants-documenting-a-transplant-with-consistent-photos': require('@/assets/images/angle-portrait.jpg'),
};

export function articleImage(article: Pick<Article, 'slug' | 'category'>): number | undefined {
  return ARTICLE_IMAGES[article.slug] ?? CATEGORY_IMAGES[article.category];
}
