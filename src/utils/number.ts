/**
 * Utility functions for normalizing digits.
 * Converts Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) and Eastern Persian digits (۰۱۲۳۴۵۶۷۸۹)
 * into standard Western Arabic numerals (0-9).
 */

export function normalizeArabicDigits(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return '';
  const str = String(input);
  return str
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));
}

/**
 * Normalizes Arabic digits and strips all non-numeric characters.
 */
export function cleanNumericInput(raw: string | number | null | undefined, maxLength?: number): string {
  const normalized = normalizeArabicDigits(raw).replace(/\D/g, '');
  return maxLength ? normalized.slice(0, maxLength) : normalized;
}

/**
 * Normalizes input to digits only, suited for positive numbers (e.g., duration in days).
 */
export function cleanDurationInput(raw: string | number | null | undefined): string {
  const digits = cleanNumericInput(raw);
  if (!digits) return '';
  const parsed = parseInt(digits, 10);
  return isNaN(parsed) ? '' : String(parsed);
}
