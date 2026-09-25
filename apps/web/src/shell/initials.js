/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Derive a two-letter avatar label from an authenticated email address
 * (I0001-R009). Uses the local-part only — the domain is never shown.
 * @param {string} email
 * @returns {string} One or two uppercase letters, or `?` for an unusable input.
 */
export function initialsFromEmail(email) {
  if (typeof email !== 'string' || email.length === 0) return '?';
  const local = email.split('@')[0];
  const letters = local.match(/[a-zA-Z]/g);
  if (!letters || letters.length === 0) return '?';
  const [first, second] = letters;
  return (first + (second ?? '')).toUpperCase();
}
