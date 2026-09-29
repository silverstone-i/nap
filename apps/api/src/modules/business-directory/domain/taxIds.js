/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';
import { DirectoryError } from './errors.js';

const ALGORITHM = 'aes-256-gcm';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Reduce an entered tax ID to its digits. An SSN or EIN has nine digits in
 * any formatting (`123-45-6789`, `12-3456789`, `123456789`); anything else is
 * rejected. The digits are what gets encrypted, hashed, and masked, so the
 * same number always hashes the same way (M0005-R010, R013).
 * @param {unknown} value
 * @returns {string} Nine digits.
 * @throws {DirectoryError} `INVALID_INPUT`
 */
export function normalizeTaxId(value) {
  if (typeof value !== 'string') throw new DirectoryError('INVALID_INPUT');
  const trimmed = value.trim();
  if (!/^[0-9 -]+$/.test(trimmed)) throw new DirectoryError('INVALID_INPUT');
  const digits = trimmed.replace(/[ -]/g, '');
  if (!/^[0-9]{9}$/.test(digits)) throw new DirectoryError('INVALID_INPUT');
  return digits;
}

/**
 * Bind a ciphertext to its row, so a value copied to another record or
 * tenant fails to decrypt instead of revealing the wrong person's number.
 * @param {string} tenantId
 * @param {string} partyId
 * @returns {Buffer}
 */
function context(tenantId, partyId) {
  return Buffer.from(`${tenantId}:${partyId}`, 'utf8');
}

/**
 * Tax ID protection for one deployment (M0005-R010, R011). The keys come
 * from `runtimeConfiguration().taxIds` and never touch a database.
 * @param {{encryptionKey: Buffer, hashKey: string}} keys
 * @returns {{protect: Function, reveal: Function, hash: Function}}
 */
export function createTaxIdProtector({ encryptionKey, hashKey }) {
  if (!Buffer.isBuffer(encryptionKey) || encryptionKey.length !== 32)
    throw new TypeError('encryptionKey must be 32 bytes');
  if (typeof hashKey !== 'string' || hashKey.length < 32)
    throw new TypeError('hashKey must be at least 32 characters');

  /**
   * HMAC-SHA-256 of the normalized digits, as 64 lowercase hex characters.
   * @param {unknown} value Entered tax ID.
   * @returns {string}
   */
  function hash(value) {
    return createHmac('sha256', hashKey)
      .update(normalizeTaxId(value))
      .digest('hex');
  }

  /**
   * The three stored columns for a tax ID, or all null when `value` is null.
   * Each call uses a fresh random nonce.
   * @param {unknown} value Entered tax ID, or null to clear it.
   * @param {{tenantId: string, partyId: string}} row
   * @returns {{tax_id_encrypted: string|null, tax_id_hash: string|null, tax_id_last4: string|null}}
   */
  function protect(value, { tenantId, partyId }) {
    if (value === null)
      return { tax_id_encrypted: null, tax_id_hash: null, tax_id_last4: null };
    const digits = normalizeTaxId(value);
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv(ALGORITHM, encryptionKey, nonce);
    cipher.setAAD(context(tenantId, partyId));
    const body = Buffer.concat([cipher.update(digits, 'utf8'), cipher.final()]);
    return {
      tax_id_encrypted: Buffer.concat([
        nonce,
        cipher.getAuthTag(),
        body,
      ]).toString('base64'),
      tax_id_hash: hash(digits),
      tax_id_last4: digits.slice(-4),
    };
  }

  /**
   * Decrypt a stored tax ID for the row it belongs to.
   * @param {string} stored `tax_id_encrypted`.
   * @param {{tenantId: string, partyId: string}} row
   * @returns {string} Nine digits.
   * @throws {Error} When the value was altered, belongs to another row, or the key is wrong.
   */
  function reveal(stored, { tenantId, partyId }) {
    const raw = Buffer.from(stored, 'base64');
    const nonce = raw.subarray(0, NONCE_BYTES);
    const tag = raw.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES);
    const decipher = createDecipheriv(ALGORITHM, encryptionKey, nonce);
    decipher.setAAD(context(tenantId, partyId));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(raw.subarray(NONCE_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');
  }

  return { protect, reveal, hash };
}
