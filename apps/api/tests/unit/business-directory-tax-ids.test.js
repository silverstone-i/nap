/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  createTaxIdProtector,
  normalizeTaxId,
} from '../../src/modules/business-directory/domain/taxIds.js';
import { runtimeConfiguration } from '../../src/application/shared/runtimeConfiguration.js';

const keys = {
  encryptionKey: randomBytes(32),
  hashKey: 'tax-id-hash-key-of-ample-length-for-tests',
};
const row = { tenantId: randomUUID(), partyId: randomUUID() };

describe('normalizeTaxId', () => {
  it('accepts nine digits in SSN, EIN, or bare form', () => {
    for (const value of [
      '123-45-6789',
      '12-3456789',
      '123456789',
      ' 123 45 6789 ',
    ])
      expect(normalizeTaxId(value).length).toBe(9);
  });

  it('rejects anything that is not nine digits', () => {
    for (const value of [
      '12345678',
      '1234567890',
      '123-45-678X',
      '',
      null,
      123456789,
    ])
      expect(() => normalizeTaxId(value)).toThrow('INVALID_INPUT');
  });
});

describe('createTaxIdProtector (M0005-R010)', () => {
  const protector = createTaxIdProtector(keys);

  it('AC10: stores no plain-text copy and decrypts back to the digits', () => {
    const stored = protector.protect('123-45-6789', row);
    expect(JSON.stringify(stored)).not.toContain('123456789');
    expect(JSON.stringify(stored)).not.toContain('123-45-6789');
    expect(stored.tax_id_last4).toBe('6789');
    expect(stored.tax_id_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(protector.reveal(stored.tax_id_encrypted, row)).toBe('123456789');
  });

  it('uses a fresh nonce on every write but the same hash', () => {
    const a = protector.protect('123456789', row);
    const b = protector.protect('123456789', row);
    expect(a.tax_id_encrypted).not.toBe(b.tax_id_encrypted);
    expect(a.tax_id_hash).toBe(b.tax_id_hash);
  });

  it('AC12: hashes the same number the same way with or without dashes', () => {
    expect(protector.hash('123-45-6789')).toBe(protector.hash('123456789'));
    expect(protector.hash('12-3456789')).toBe(protector.hash('123456789'));
    expect(protector.hash('123456780')).not.toBe(protector.hash('123456789'));
  });

  it('keys the hash, so another key gives another hash', () => {
    const other = createTaxIdProtector({
      ...keys,
      hashKey: 'a-different-hash-key-of-ample-length-here',
    });
    expect(other.hash('123456789')).not.toBe(protector.hash('123456789'));
  });

  it('refuses a ciphertext moved to another row, altered, or read with another key', () => {
    const { tax_id_encrypted: stored } = protector.protect('123456789', row);
    expect(() =>
      protector.reveal(stored, { ...row, partyId: randomUUID() })
    ).toThrow();
    expect(() =>
      protector.reveal(stored, { ...row, tenantId: randomUUID() })
    ).toThrow();
    const altered = Buffer.from(stored, 'base64');
    altered[altered.length - 1] ^= 1;
    expect(() => protector.reveal(altered.toString('base64'), row)).toThrow();
    const stranger = createTaxIdProtector({
      ...keys,
      encryptionKey: randomBytes(32),
    });
    expect(() => stranger.reveal(stored, row)).toThrow();
  });

  it('clears all three columns for null', () => {
    expect(protector.protect(null, row)).toEqual({
      tax_id_encrypted: null,
      tax_id_hash: null,
      tax_id_last4: null,
    });
  });

  it('rejects weak keys', () => {
    expect(() =>
      createTaxIdProtector({ ...keys, encryptionKey: randomBytes(16) })
    ).toThrow();
    expect(() => createTaxIdProtector({ ...keys, hashKey: 'short' })).toThrow();
  });
});

describe('tax ID configuration (M0005-R011)', () => {
  const base = {
    NODE_ENV: 'test',
    ADMIN_DATABASE_TEST: 'db.example/nap_test_admin',
    NAP_APP_PSWD_TEST: 'test-app-password',
    SESSION_SECRET_TEST: 'test-session-secret-of-ample-length-here',
    AUTH_THROTTLE_SECRET_TEST: 'test-throttle-secret-of-ample-length-here',
    TAX_ID_ENCRYPTION_KEY_TEST: randomBytes(32).toString('base64'),
    TAX_ID_HASH_KEY_TEST: 'test-tax-id-hash-key-of-ample-length',
    APP_ORIGIN_TEST: 'http://localhost:5173',
  };

  it('loads a 32-byte encryption key and the hash key', () => {
    const { taxIds } = runtimeConfiguration(base);
    expect(taxIds.encryptionKey.length).toBe(32);
    expect(taxIds.hashKey).toBe(base.TAX_ID_HASH_KEY_TEST);
  });

  it('AC10: refuses to start without valid, distinct keys', () => {
    for (const [change, setting] of [
      [{ TAX_ID_ENCRYPTION_KEY_TEST: undefined }, 'TAX_ID_ENCRYPTION_KEY_TEST'],
      [
        { TAX_ID_ENCRYPTION_KEY_TEST: randomBytes(16).toString('base64') },
        'TAX_ID_ENCRYPTION_KEY_TEST',
      ],
      [
        { TAX_ID_ENCRYPTION_KEY_TEST: 'not base64!' },
        'TAX_ID_ENCRYPTION_KEY_TEST',
      ],
      [
        { TAX_ID_ENCRYPTION_KEY_TEST: '<test-tax-id-encryption-key>' },
        'TAX_ID_ENCRYPTION_KEY_TEST',
      ],
      [{ TAX_ID_HASH_KEY_TEST: undefined }, 'TAX_ID_HASH_KEY_TEST'],
      [{ TAX_ID_HASH_KEY_TEST: 'short' }, 'TAX_ID_HASH_KEY_TEST'],
      [
        { TAX_ID_HASH_KEY_TEST: base.SESSION_SECRET_TEST },
        'TAX_ID_HASH_KEY_TEST',
      ],
      [
        { TAX_ID_HASH_KEY_TEST: base.AUTH_THROTTLE_SECRET_TEST },
        'TAX_ID_HASH_KEY_TEST',
      ],
    ]) {
      let error;
      try {
        runtimeConfiguration({ ...base, ...change });
      } catch (caught) {
        error = caught;
      }
      expect(error?.code).toBe('INVALID_CONFIGURATION');
      expect(error?.setting).toBe(setting);
    }
  });
});
