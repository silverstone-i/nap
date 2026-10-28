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

// The start of an extension marker, `x` or any prefix of `ext.`, as typed.
const EXT_MARKER = /^(?:x|e|ex|ext|ext\.)$/i;

/**
 * A phone being typed, formatted as far as it goes: `2125` reads
 * `(212) 5` for the US. From the first letter on is an extension: its marker
 * stays as typed while it is `x` or a prefix of `ext.`, and up to 10 digits
 * follow (M0005-R033). Anything else is dropped. The result is accepted by
 * `normalizePhone` once the number is complete.
 * @param {string} input
 * @param {string} [country] The tenant's default country.
 * @returns {string}
 */
export function formatPhoneInput(input, country = DEFAULT_PHONE_COUNTRY) {
  const letter = input.search(/[a-z]/i);
  const main = letter === -1 ? input : input.slice(0, letter);
  const digits = main.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  const number = digits ? new AsYouType(country).input(digits) : '';
  if (letter === -1 || !number) return number;
  const [, marker, rest] = input.slice(letter).match(/^([a-z.]*)(.*)$/i);
  if (!EXT_MARKER.test(marker)) return number;
  const ext = rest.replace(/\D/g, '').slice(0, 10);
  return `${number} ${marker}${ext && (marker.endsWith('.') ? ' ' : '')}${ext}`;
}
