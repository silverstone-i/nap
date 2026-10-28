/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import { canonicalTaxId } from '@nap/shared';
import { relayTaxId } from '../src/pages/directory/useTaxIdFormats.js';

const SSN = '###-##-####';
const EIN = '##-#######';
const VAT = 'GB ### #### ##';

describe('relayTaxId', () => {
  it('moves a typed tax ID between masks with the same slots', () => {
    expect(relayTaxId('123-45-6789', SSN, EIN)).toBe('12-3456789');
    expect(relayTaxId('12-3456789', EIN, SSN)).toBe('123-45-6789');
    expect(relayTaxId('123-4', SSN, EIN)).toBe('12-34');
  });

  it('moves only slot characters to and from a mask with letters', () => {
    expect(relayTaxId('123-45-6789', SSN, VAT)).toBe('GB 123 4567 89');
    const back = relayTaxId('GB 123 4567 89', VAT, SSN);
    expect(back).toBe('123-45-6789');
    expect(canonicalTaxId(back, SSN)).toBe('123456789');
  });

  it('keeps the value when the new mask cannot hold it all', () => {
    expect(relayTaxId('123-45-6789', SSN, '##-##')).toBe('123-45-6789');
    expect(relayTaxId('12-3456789', EIN, 'AA-##')).toBe('12-3456789');
  });

  it('takes letters and digits when there was no mask, and keeps the value without a new one', () => {
    expect(relayTaxId('123 45 6789', undefined, SSN)).toBe('123-45-6789');
    expect(relayTaxId('123-45-6789', SSN, undefined)).toBe('123-45-6789');
  });
});
