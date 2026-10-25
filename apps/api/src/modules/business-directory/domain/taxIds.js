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
import { canonicalTaxId } from '@nap/shared';
import { DirectoryError } from './errors.js';

const ALGORITHM = 'aes-256-gcm';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Reduce an entered tax ID to its canonical form under its format's mask:
 * the slot characters alone, uppercased (M0005-R038). The canonical value is
 * what gets encrypted, hashed, and masked, so the same number always hashes
 * the same way whatever format it was saved with (R039).
 * @param {unknown} value
 * @param {string} mask
 * @returns {string}
 * @throws {DirectoryError} `INVALID_INPUT`
 */
export function normalizeTaxId(value, mask) {
  const canonical = canonicalTaxId(value, mask);
  if (canonical === null) throw new DirectoryError('INVALID_INPUT');
  return canonical;
}

/**
 * The canonical values a tax ID search could mean: the input under each of
 * the tenant's masks, and its letters and digits alone (R013, R039).
 * @param {string} value Entered search text.
 * @param {string[]} masks
 * @returns {string[]}
 */
export function searchCandidates(value, masks) {
  const candidates = new Set(
    masks.map(mask => canonicalTaxId(value, mask)).filter(Boolean)
  );
  const bare = value.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  if (bare.length >= 4) candidates.add(bare);
  return [...candidates];
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
   * HMAC-SHA-256 of a canonical tax ID, as 64 lowercase hex characters.
   * @param {string} canonical
   * @returns {string}
   */
  function hash(canonical) {
    return createHmac('sha256', hashKey).update(canonical).digest('hex');
  }

  /**
   * The four stored columns for a tax ID, or all null when `value` is null.
   * Each call uses a fresh random nonce.
   * @param {unknown} value Entered tax ID, or null to clear it.
   * @param {{id: string, mask: string}|null} format The format it was entered in (R038).
   * @param {{tenantId: string, partyId: string}} row
   * @returns {{tax_id_format_id: string|null, tax_id_encrypted: string|null, tax_id_hash: string|null, tax_id_last4: string|null}}
   * @throws {DirectoryError} `INVALID_INPUT` when the value does not fit the format.
   */
  function protect(value, format, { tenantId, partyId }) {
    if (value === null)
      return {
        tax_id_format_id: null,
        tax_id_encrypted: null,
        tax_id_hash: null,
        tax_id_last4: null,
      };
    const canonical = normalizeTaxId(value, format.mask);
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv(ALGORITHM, encryptionKey, nonce);
    cipher.setAAD(context(tenantId, partyId));
    const body = Buffer.concat([
      cipher.update(canonical, 'utf8'),
      cipher.final(),
    ]);
    return {
      tax_id_format_id: format.id,
      tax_id_encrypted: Buffer.concat([
        nonce,
        cipher.getAuthTag(),
        body,
      ]).toString('base64'),
      tax_id_hash: hash(canonical),
      tax_id_last4: canonical.slice(-4),
    };
  }

  /**
   * Decrypt a stored tax ID for the row it belongs to.
   * @param {string} stored `tax_id_encrypted`.
   * @param {{tenantId: string, partyId: string}} row
   * @returns {string} The canonical tax ID.
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
