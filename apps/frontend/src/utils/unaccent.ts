/**
 * Remove Vietnamese diacritical marks for accent-insensitive matching.
 *
 * Example: "Gỏi Cuốn" → "Goi Cuon"
 *          "Nguyễn"   → "Nguyen"
 *          "Đà Nẵng"  → "Da Nang"
 *
 * Used for client-side filter matching (Select, Autocomplete, etc.)
 * so that typing "goi" matches "Gỏi Cuốn".
 */
export function removeDiacritics(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining marks
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Accent-insensitive string includes check.
 * Returns true if `haystack` contains `needle` after removing diacritics.
 */
export function unaccentIncludes(haystack: string, needle: string): boolean {
  return removeDiacritics(haystack).toLowerCase().includes(removeDiacritics(needle).toLowerCase());
}