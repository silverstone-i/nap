/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file Tax ID format rules (M0005-R036, R038, R040, R041). A mask's `#` is
 * a digit slot, `A` a letter slot, and every other character a separator
 * that is shown but not stored. The API validates with these functions and
 * the web app displays with them (M0005-R044).
 */

const DIGIT = '#';
const LETTER = 'A';
const MIN_SLOTS = 4;
const MAX_SLOTS = 32;
/** Longest mask, separators included. */
export const MAX_MASK_LENGTH = 64;

/** @param {string} char */
const isSlot = char => char === DIGIT || char === LETTER;

/**
 * A mask's slots alone, such as `#########` for `###-##-####`.
 * @param {string} mask
 * @returns {string}
 */
export function maskSlots(mask) {
  return [...mask].filter(isSlot).join('');
}

/**
 * Whether a mask is usable: at most 64 characters with 4 to 32 slots
 * (M0005-R036).
 * @param {unknown} mask
 * @returns {boolean}
 */
export function isValidMask(mask) {
  if (typeof mask !== 'string' || mask.length > MAX_MASK_LENGTH) return false;
  if (mask.trim() !== mask) return false;
  const slots = maskSlots(mask).length;
  return slots >= MIN_SLOTS && slots <= MAX_SLOTS;
}

/**
 * Whether two masks have the same slot count and slot types, so a tax ID
 * valid under one is valid under the other (M0005-R041).
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function sameSlots(a, b) {
  return maskSlots(a) === maskSlots(b);
}

/**
 * @param {string} slot `#` or `A`.
 * @param {string} char One uppercased input character.
 */
function fits(slot, char) {
  return slot === DIGIT ? /^[0-9]$/.test(char) : /^[A-Z]$/.test(char);
}

/**
 * The canonical tax ID for an entered value: its slot characters alone,
 * uppercased. After spaces and hyphens are removed, the value must equal the
 * mask filled in, its other separators included, or the slot characters
 * alone (M0005-R038).
 * @param {unknown} input
 * @param {string} mask
 * @returns {string|null} Null when the value does not fit the mask.
 */
export function canonicalTaxId(input, mask) {
  if (typeof input !== 'string') return null;
  const entered = input.replace(/[\s-]/g, '').toUpperCase();
  const compact = mask.replace(/[\s-]/g, '').toUpperCase();
  const slots = maskSlots(mask);
  if (entered.length === slots.length) {
    return [...slots].every((slot, i) => fits(slot, entered[i]))
      ? entered
      : null;
  }
  if (entered.length !== compact.length) return null;
  let canonical = '';
  for (let i = 0; i < compact.length; i += 1) {
    if (isSlot(compact[i])) {
      if (!fits(compact[i], entered[i])) return null;
      canonical += entered[i];
    } else if (compact[i] !== entered[i]) return null;
  }
  return canonical;
}

/**
 * Lay characters into a mask's slots, keeping its separators.
 * @param {string[]} chars One per slot.
 * @param {string} mask
 */
function layOut(chars, mask) {
  let next = 0;
  return [...mask].map(c => (isSlot(c) ? (chars[next++] ?? '') : c)).join('');
}

/**
 * A revealed tax ID in its format's layout, such as `123-45-6789`
 * (M0005-R040).
 * @param {string} canonical
 * @param {string} mask
 * @returns {string}
 */
export function formatTaxId(canonical, mask) {
  return layOut([...canonical], mask);
}

/**
 * A masked tax ID in its format's layout, every slot but the last four shown
 * as `•`, such as `•••-••-6789` (M0005-R040).
 * @param {string} last4
 * @param {string} mask
 * @returns {string}
 */
export function maskTaxId(last4, mask) {
  const hidden = maskSlots(mask).length - last4.length;
  return layOut([...Array(Math.max(hidden, 0)).fill('•'), ...last4], mask);
}
