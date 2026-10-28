/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file Phone storage and display rules (M0005-R033, R034, R046). The API
 * stores what `normalizePhone` returns and the web app shows what
 * `formatPhone` returns, so both apply one definition (M0005-R044). Both take
 * the tenant's default country (M0006-01-R011).
 */
import { AsYouType, parsePhoneNumberFromString } from 'libphonenumber-js/max';

/** Country used when the tenant's default country is not given (M0006-01-R004). */
export const DEFAULT_PHONE_COUNTRY = 'US';

// Digits, `+`, and common punctuation, then an optional `x 12` or `ext. 12`.
// libphonenumber alone would pull a number out of surrounding text.
const ENTERED = /^[0-9+().\- ]+(?:(?:x|ext\.?)\s*[0-9]{1,10})?$/i;

/**
 * Parse a stored or entered phone into a libphonenumber number.
 * @param {string} value
 * @param {string} country Country for a number without a leading `+`.
 * @returns {import('libphonenumber-js').PhoneNumber|null} Null when invalid.
 */
function parsePhone(value, country) {
  const number = parsePhoneNumberFromString(value, country);
  return number?.isValid() ? number : null;
}

/**
 * The stored form of an entered phone: E.164, with an extension as a
 * `;ext=` suffix (`+12125551234;ext=12`). Input without a leading `+` is a
 * number of `country` (M0005-R046).
 * @param {unknown} input
 * @param {string} [country] The tenant's default country.
 * @returns {string|null} Null when the input is not a valid number for its country.
 */
export function normalizePhone(input, country = DEFAULT_PHONE_COUNTRY) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed.length > 32 || !ENTERED.test(trimmed)) return null;
  const number = parsePhone(trimmed, country);
  if (!number) return null;
  return number.ext ? `${number.number};ext=${number.ext}` : number.number;
}

/**
 * The display form of a stored phone: national for a number of `country`
 * (`(212) 555-1234` for the US), international otherwise
 * (`+44 20 7946 0958`), with an extension as ` ext. 12` (M0005-R046).
 * @param {string} stored
 * @param {string} [country] The tenant's default country.
 * @returns {string} The stored value unchanged when it does not parse.
 */
export function formatPhone(stored, country = DEFAULT_PHONE_COUNTRY) {
  const number = parsePhone(stored, country);
  if (!number) return stored;
  return number.country === country
    ? number.formatNational()
    : number.formatInternational();
}

// A trailing extension as typed: `x` or a prefix of `ext.`, its spacing, and
// up to 10 digits.
const TRAILING_EXT = /\s*(x|e|ex|ext|ext\.)(\s*)(\d{0,10})$/i;

/**
 * A phone being typed, formatted as far as it goes: `2125` reads
 * `(212) 5` for the US. A trailing extension keeps its marker as typed while
 * it is `x` or a prefix of `ext.`, then up to 10 digits (M0005-R033). Text
 * with letters anywhere else is not a phone being typed, such as a pasted
 * `Tel: 212 555 1234`, and comes back unchanged for validation to flag. The
 * result is accepted by `normalizePhone` once the number is complete.
 * @param {string} input
 * @param {string} [country] The tenant's default country.
 * @returns {string}
 */
export function formatPhoneInput(input, country = DEFAULT_PHONE_COUNTRY) {
  const ext = input.match(TRAILING_EXT);
  const main = ext ? input.slice(0, ext.index) : input;
  if (/[a-z]/i.test(main)) return input;
  const digits = main.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  const number = digits ? new AsYouType(country).input(digits) : '';
  if (!ext) return number;
  if (!number) return input;
  const [, marker, space, extDigits] = ext;
  return `${number} ${marker}${space ? ' ' : ''}${extDigits}`;
}
