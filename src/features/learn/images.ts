import { ARTICLE_PHOTO_CREDITS, ARTICLE_PHOTOS, type PhotoCredit } from './article-photos';
import type { Article } from './library';

/**
 * An article's photograph, downloaded for that article from Unsplash.
 * Articles without one fall back to a drawn cover in the UI.
 */
export function articleImage(article: Pick<Article, 'slug'>): number | undefined {
  return ARTICLE_PHOTOS[article.slug];
}

/** Who took the article's photograph, for the credit line in the reader. */
export function articleImageCredit(article: Pick<Article, 'slug'>): PhotoCredit | undefined {
  return ARTICLE_PHOTO_CREDITS[article.slug];
}
