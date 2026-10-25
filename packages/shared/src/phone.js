/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file Phone storage and display rules (M0005-R033, R034). The API stores
 * what `normalizePhone` returns and the web app shows what `formatPhone`
 * returns, so both apply one definition (M0005-R044).
 */
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

/** Country assumed for a number entered without a leading `+` (M0005-R033). */
export const DEFAULT_PHONE_COUNTRY = 'US';

// Digits, `+`, and common punctuation, then an optional `x 12` or `ext. 12`.
// libphonenumber alone would pull a number out of surrounding text.
const ENTERED = /^[0-9+().\- ]+(?:(?:x|ext\.?)\s*[0-9]{1,10})?$/i;

/**
 * Parse a stored or entered phone into a libphonenumber number.
 * @param {string} value
 * @returns {import('libphonenumber-js').PhoneNumber|null} Null when invalid.
 */
function parsePhone(value) {
  const number = parsePhoneNumberFromString(value, DEFAULT_PHONE_COUNTRY);
  return number?.isValid() ? number : null;
}

/**
 * The stored form of an entered phone: E.164, with an extension as a
 * `;ext=` suffix (`+12125551234;ext=12`).
 * @param {unknown} input
 * @returns {string|null} Null when the input is not a valid number for its country.
 */
export function normalizePhone(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length > 32 || !ENTERED.test(trimmed)) return null;
  const number = parsePhone(trimmed);
  if (!number) return null;
  return number.ext ? `${number.number};ext=${number.ext}` : number.number;
}

/**
 * The display form of a stored phone: national for a US number
 * (`(212) 555-1234`), international otherwise (`+44 20 7946 0958`), with an
 * extension as ` ext. 12`.
 * @param {string} stored
 * @returns {string} The stored value unchanged when it does not parse.
 */
export function formatPhone(stored) {
  const number = parsePhone(stored);
  if (!number) return stored;
  return number.country === DEFAULT_PHONE_COUNTRY
    ? number.formatNational()
    : number.formatInternational();
}
