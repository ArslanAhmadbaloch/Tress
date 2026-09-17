/**
 * The only string work the kit does.
 *
 * Two pure helpers, kept apart from the components so a test can hold
 * them without a native runtime: the accent split that colours one word
 * of a headline, and the greeting that puts a name into a title. Neither
 * owns a word of copy — both take the sentence from the caller.
 */

/**
 * The headline with one word in the accent colour.
 *
 * Splits on the first occurrence of the keyword, as a whole word, so
 * "hair" in "haircare" is left alone. A keyword not found leaves the
 * title uncoloured rather than throwing.
 */
export function splitAccent(
  title: string,
  accentWord: string | undefined,
): { before: string; word: string; after: string } | null {
  if (!accentWord) return null;
  const escaped = accentWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(^|[^\\p{L}\\p{N}])(${escaped})(?![\\p{L}\\p{N}])`, 'u').exec(title);
  if (!match) return null;
  const start = match.index + match[1].length;
  return {
    before: title.slice(0, start),
    word: title.slice(start, start + accentWord.length),
    after: title.slice(start + accentWord.length),
  };
}

/**
 * Puts the person's name into a title written with a `{name}` placeholder.
 * Without a name the placeholder goes, and so does the comma that was
 * addressing it: "Great start, {name}!" reads "Great start!".
 */
export function greet(title: string, name: string | undefined): string {
  const trimmed = name?.trim() ?? '';
  if (!trimmed) return title.replace(/,?\s*\{name\}/g, '').replace(/\s+([,!?.])/g, '$1').trim();
  return title.replace(/\{name\}/g, trimmed);
}
