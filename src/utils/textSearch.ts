/** Lowercases and strips accents/diacritics so search comparisons ignore them (e.g. "cafe" matches "café"). */
export function normalizeForSearch(text: string): string {
    return text
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase();
}
