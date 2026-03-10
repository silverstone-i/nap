/**
 * @file Pattern-based display formatter for phone numbers and tax identifiers
 * @module nap-client/utils/formatByPattern
 *
 * Formats a raw value using a placeholder pattern where `X` represents an input
 * character and all other characters are literal separators inserted automatically.
 *
 * Examples:
 *   formatByPattern('7703316000', '(XXX) XXX-XXXX')  → '(770) 331-6000'
 *   formatByPattern('111005555',  'XXX-XX-XXXX')     → '111-00-5555'
 *   formatByPattern('123456789',  'XX-XXXXXXX')      → '12-3456789'
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

/**
 * Format a raw string into a display pattern.
 * @param {string} raw   Raw input value (digits/letters, no separators)
 * @param {string} [pattern] Placeholder pattern with X as fill positions
 * @returns {string} Formatted string, or raw value if no pattern
 */
export function formatByPattern(raw, pattern) {
  if (!raw || !pattern) return raw || '';
  const chars = raw.replace(/[\s\-()./]/g, '');
  if (!chars.length) return '';
  let result = '';
  let ci = 0;
  for (const ch of pattern) {
    if (ci >= chars.length) break;
    if (ch === 'X') {
      result += chars[ci++];
    } else {
      result += ch;
    }
  }
  // Append remaining characters if input is longer than pattern X-slots
  if (ci < chars.length) result += chars.slice(ci);
  return result;
}

/**
 * Strip common formatting separators from a value, keeping only digits/letters.
 * @param {string} value Formatted or raw value
 * @returns {string} Value with separators removed
 */
export function stripFormatting(value) {
  return (value || '').replace(/[\s\-()./]/g, '');
}
