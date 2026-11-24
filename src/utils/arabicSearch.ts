/**
 * Utility functions for advanced, flexible Arabic search.
 * Handles:
 * - Normalization of Alef variants (أ, إ, آ, ٱ -> ا)
 * - Normalization of Taa Marbuta and Haa (ة -> ه)
 * - Normalization of Alef Maksura and Yaa (ى -> ي)
 * - Normalization of Hamza on Waw / Yaa (ؤ -> و, ئ -> ي)
 * - Stripping of Tashkeel / Harakat (fatḥah, ḍammah, kasrah, sukūn, shaddah, etc.)
 * - Stripping of Tatweel / Kashida (ـ)
 * - Multi-word / token-based search: every token typed in the query must match
 *   in the target (e.g. typing "محمد السالم" matches "محمد عبدالله السالم")
 * - Compound prefix matching (e.g. "عبد الله" matches "عبدالله" and vice-versa)
 */

export function normalizeArabic(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632)) // Arabic-Indic digits
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776)) // Persian digits
    .replace(/[\u064B-\u065F\u0670]/g, '') // remove Arabic diacritics / tashkeel
    .replace(/[\u0640]/g, '')              // remove tatweel / kashida (ـ)
    .replace(/[أإآٱ]/g, 'ا')               // normalize alefs
    .replace(/ة/g, 'ه')                    // normalize taa marbuta
    .replace(/ى/g, 'ي')                    // normalize alef maksura
    .replace(/ؤ/g, 'و')                    // normalize hamza on waw
    .replace(/ئ/g, 'ي')                    // normalize hamza on yaa
    .trim();
}

/**
 * Checks whether target text matches the search query using flexible Arabic token-matching.
 * @param target A single string or an array of candidate strings (e.g. [name, file_number, rank, job_title])
 * @param query The search query entered by the user
 */
export function arabicSearchMatches(
  target: string | (string | null | undefined)[] | null | undefined,
  query: string | null | undefined
): boolean {
  if (!query || !query.trim()) return true;
  if (!target) return false;

  const targetStr = Array.isArray(target)
    ? target.filter(Boolean).join(' ')
    : String(target);

  if (!targetStr.trim()) return false;

  const normTarget = normalizeArabic(targetStr);
  const normTargetNoSpaces = normTarget.replace(/\s+/g, '');

  const normQuery = normalizeArabic(query);
  const tokens = normQuery.split(/\s+/).filter(Boolean);

  // Every token in the query must match somewhere in the target
  return tokens.every((token) => {
    // 1. Direct substring match
    if (normTarget.includes(token)) return true;

    // 2. Substring match without spaces (useful for compound names like "عبدالله" vs "عبد الله")
    const tokenNoSpaces = token.replace(/\s+/g, '');
    if (normTargetNoSpaces.includes(tokenNoSpaces)) return true;

    // 3. If token starts with "عبد" without a space, try with space "عبد "
    if (token.startsWith('عبد') && token.length > 3) {
      const withSpace = 'عبد ' + token.slice(3);
      if (normTarget.includes(withSpace)) return true;
    }

    return false;
  });
}
