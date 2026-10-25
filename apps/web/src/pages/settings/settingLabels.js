/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Display name of each general setting, in screen order (M0006-01-R010). */
export const SETTING_LABELS = Object.freeze({
  defaultCountry: 'Default country',
  currency: 'Currency',
  timeZone: 'Time zone',
  dateFormat: 'Date format',
  language: 'Language',
  recordsPerPage: 'Records per page',
});

/** Display name of each language nap ships. */
export const LANGUAGE_NAMES = Object.freeze({ en: 'English' });

/**
 * A setting's value as a person reads it, such as `English` for `en`.
 * @param {string} name
 * @param {unknown} value
 * @returns {string}
 */
export function describeSetting(name, value) {
  if (name === 'language') return LANGUAGE_NAMES[value] ?? String(value);
  return String(value);
}
