/**
 * Word counting using Intl.Segmenter (UAX #29 word boundaries).
 *
 * Works correctly across scripts: English, CJK, Thai, Arabic, etc.
 * The "en" locale is used as a default; UAX #29 word boundaries apply
 * universally regardless of locale for unambiguous cases.
 */

const segmenter = new Intl.Segmenter("en", { granularity: "word" });

/**
 * Count the number of words in a text string.
 * Uses Intl.Segmenter with isWordLike filter to correctly handle
 * all Unicode scripts including CJK and Thai.
 */
export function countWords(text: string): number {
  if (!text || !text.trim()) {
    return 0;
  }

  let count = 0;
  for (const segment of segmenter.segment(text)) {
    if (segment.isWordLike) {
      count++;
    }
  }
  return count;
}
