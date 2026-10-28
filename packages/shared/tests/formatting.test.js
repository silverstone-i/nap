/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import {
  canonicalTaxId,
  formatPhone,
  formatPhoneInput,
  formatTaxId,
  formatTaxIdInput,
  isValidMask,
  maskTaxId,
  normalizePhone,
  sameSlots,
} from '@nap/shared';

describe('phones (M0005-R033, R034)', () => {
  it('AC19: stores entered US numbers in E.164 form, extensions included', () => {
    for (const entered of [
      '212-555-1234',
      '(212) 555-1234',
      '+1 212 555 1234',
      ' 212.555.1234 ',
    ])
      expect(normalizePhone(entered)).toBe('+12125551234');
    expect(normalizePhone('212 555 1234 x12')).toBe('+12125551234;ext=12');
    expect(normalizePhone('212-555-1234 ext. 7')).toBe('+12125551234;ext=7');
  });

  it('AC19: refuses numbers that are not valid for their country', () => {
    for (const entered of [
      '555-1234',
      '',
      'call 212 555 1234',
      '+44 20',
      null,
      42,
    ])
      expect(normalizePhone(entered)).toBeNull();
  });

  it('AC20: shows US numbers in national form and others internationally', () => {
    expect(formatPhone('+12125551234')).toBe('(212) 555-1234');
    expect(formatPhone('+442079460958')).toBe('+44 20 7946 0958');
    expect(formatPhone('+12125551234;ext=12')).toBe('(212) 555-1234 ext. 12');
  });

  it('shows a value that does not parse unchanged', () => {
    expect(formatPhone('not a phone')).toBe('not a phone');
  });
});

describe('phones as typed (M0005-R033)', () => {
  it('formats a partial number as far as it goes', () => {
    expect(formatPhoneInput('212')).toBe('(212)');
    expect(formatPhoneInput('2125')).toBe('(212) 5');
    expect(formatPhoneInput('212.555.1234')).toBe('(212) 555-1234');
    expect(formatPhoneInput('+442079460958')).toBe('+44 20 7946 0958');
    expect(formatPhoneInput('212+55')).toBe('(212) 55');
    expect(formatPhoneInput('')).toBe('');
  });

  it('keeps a trailing extension marker, its spacing, and its digits', () => {
    expect(formatPhoneInput('2125551234x')).toBe('(212) 555-1234 x');
    expect(formatPhoneInput('2125551234 x 12')).toBe('(212) 555-1234 x 12');
    expect(formatPhoneInput('2125551234e')).toBe('(212) 555-1234 e');
    expect(formatPhoneInput('2125551234ext.5')).toBe('(212) 555-1234 ext.5');
    expect(formatPhoneInput('(212) 555-1234 ext. 12')).toBe(
      '(212) 555-1234 ext. 12'
    );
  });

  it('leaves text with letters outside a trailing extension as typed', () => {
    for (const typed of [
      'Tel: 212 555 1234',
      '1-800-FLOWERS',
      '(212) 555-1234 ex.12',
      '(212) 555-1234 et. 12',
      '2125551234 q',
      'x12',
    ])
      expect(formatPhoneInput(typed)).toBe(typed);
  });

  it('gives what normalizePhone stores once complete', () => {
    for (const typed of ['2125551234 x12', '2125551234ext.12'])
      expect(normalizePhone(formatPhoneInput(typed))).toBe(
        '+12125551234;ext=12'
      );
  });
});

describe('tax ID formats (M0005-R036, R038, R040, R041)', () => {
  const SSN = '###-##-####';
  const EIN = '##-#######';
  const VAT = 'GB ### #### ##';

  it('accepts masks with 4 to 32 slots', () => {
    expect(isValidMask(SSN)).toBe(true);
    expect(isValidMask(VAT)).toBe(true);
    expect(isValidMask('AA-##')).toBe(true);
    expect(isValidMask('###')).toBe(false);
    expect(isValidMask('#'.repeat(33))).toBe(false);
    expect(isValidMask(` ${SSN}`)).toBe(false);
    expect(isValidMask(null)).toBe(false);
  });

  it('AC23: accepts the filled mask or the slots alone, spaces and hyphens ignored', () => {
    for (const entered of ['123-45-6789', '123 45 6789', '123456789'])
      expect(canonicalTaxId(entered, SSN)).toBe('123456789');
    expect(canonicalTaxId('12-3456789A', SSN)).toBeNull();
    expect(canonicalTaxId('12345678', SSN)).toBeNull();
    expect(canonicalTaxId('GB 123 4567 89', VAT)).toBe('123456789');
    expect(canonicalTaxId('gb123456789', VAT)).toBe('123456789');
    expect(canonicalTaxId('123456789', VAT)).toBe('123456789');
    expect(canonicalTaxId('FR 123 4567 89', VAT)).toBeNull();
  });

  it('checks each slot type and uppercases letters', () => {
    expect(canonicalTaxId('ab-12', 'AA-##')).toBe('AB12');
    expect(canonicalTaxId('12-ab', 'AA-##')).toBeNull();
    expect(canonicalTaxId(123456789, SSN)).toBeNull();
  });

  it('AC22, AC25: lays tax IDs out in the format, masked or revealed', () => {
    expect(maskTaxId('6789', SSN)).toBe('•••-••-6789');
    expect(maskTaxId('4567', EIN)).toBe('••-•••4567');
    expect(formatTaxId('123456789', SSN)).toBe('123-45-6789');
    expect(formatTaxId('123456789', EIN)).toBe('12-3456789');
    expect(formatTaxId('123456789', VAT)).toBe('GB 123 4567 89');
  });

  it('AC25: compares masks by slot count and type only', () => {
    expect(sameSlots(SSN, '### ## ####')).toBe(true);
    expect(sameSlots(SSN, EIN)).toBe(true);
    expect(sameSlots(SSN, '##-####')).toBe(false);
    expect(sameSlots('AA-##', '##-##')).toBe(false);
  });

  it('lays a tax ID into its mask as it is typed', () => {
    expect(formatTaxIdInput('333', SSN)).toBe('333');
    expect(formatTaxIdInput('3332', SSN)).toBe('333-2');
    expect(formatTaxIdInput('333224444', SSN)).toBe('333-22-4444');
    expect(formatTaxIdInput('333-22-4444', SSN)).toBe('333-22-4444');
    expect(formatTaxIdInput('333 22', SSN)).toBe('333-22');
    expect(formatTaxIdInput('333-', SSN)).toBe('333');
    expect(formatTaxIdInput('33a3', SSN)).toBe('333');
    expect(formatTaxIdInput('3332244445', SSN)).toBe('333-22-4444');
    expect(formatTaxIdInput('1', VAT)).toBe('GB 1');
    expect(formatTaxIdInput('gb 123 4', VAT)).toBe('GB 123 4');
    expect(formatTaxIdInput('ab1', 'AA-##')).toBe('AB-1');
    expect(canonicalTaxId(formatTaxIdInput('123456789', VAT), VAT)).toBe(
      '123456789'
    );
  });
});
