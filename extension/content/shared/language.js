/**
 * Orchestra Twin Bridge — Language Detector
 *
 * Detects whether text is Arabic, English, or mixed.
 * Used by content scripts to tag events for proper routing/processing.
 */

// Prevent double-injection
if (typeof window.__TwinLanguageLoaded === 'undefined') {
  window.__TwinLanguageLoaded = true;

  /**
   * Unicode ranges for language detection.
   */
  const RANGES = {
    // Arabic and extended Arabic blocks
    arabic: [
      [0x0600, 0x06ff], // Arabic
      [0x0750, 0x077f], // Arabic Supplement
      [0x08a0, 0x08ff], // Arabic Extended-A
      [0xfb50, 0xfdff], // Arabic Presentation Forms-A
      [0xfe70, 0xfeff], // Arabic Presentation Forms-B
    ],
  };

  /**
   * Check if a char code falls within Arabic ranges.
   * @param {number} code
   * @returns {boolean}
   */
  function isArabicChar(code) {
    return RANGES.arabic.some(([start, end]) => code >= start && code <= end);
  }

  /**
   * Detect the primary language of a text string.
   *
   * @param {string} text
   * @returns {'ar' | 'en' | 'mixed' | 'unknown'}
   */
  function detectLanguage(text) {
    if (!text || typeof text !== 'string') return 'unknown';

    // Strip whitespace, numbers, punctuation — count only letter characters
    const chars = text.split('').filter((c) => /\p{L}/u.test(c));
    if (chars.length === 0) return 'unknown';

    let arabicCount = 0;

    for (const char of chars) {
      const code = char.charCodeAt(0);
      if (isArabicChar(code)) arabicCount++;
    }

    const arabicRatio = arabicCount / chars.length;

    // Classification thresholds
    if (arabicRatio >= 0.9) return 'ar';
    if (arabicRatio <= 0.1) return 'en';
    return 'mixed';
  }

  /**
   * Get a breakdown of language distribution in text.
   * @param {string} text
   * @returns {{ lang: string, arabicRatio: number, arabicChars: number, totalChars: number }}
   */
  function analyzeLanguage(text) {
    if (!text || typeof text !== 'string') {
      return { lang: 'unknown', arabicRatio: 0, arabicChars: 0, totalChars: 0 };
    }

    const chars = text.split('').filter((c) => /\p{L}/u.test(c));
    let arabicCount = 0;

    for (const char of chars) {
      if (isArabicChar(char.charCodeAt(0))) arabicCount++;
    }

    const arabicRatio = chars.length > 0 ? arabicCount / chars.length : 0;

    return {
      lang: detectLanguage(text),
      arabicRatio: Math.round(arabicRatio * 100) / 100,
      arabicChars: arabicCount,
      totalChars: chars.length,
    };
  }

  // Expose globally
  window.TwinLanguage = { detectLanguage, analyzeLanguage, isArabicChar };
}
