/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Encryption of each tenant's storage secret (M0006-02-R002). The key comes
 * from `runtimeConfiguration().fileStorage` and never touches a database.
 * The tenant ID is bound to every ciphertext as additional authenticated
 * data, so a value copied into another tenant's row fails to decrypt.
 * @param {{encryptionKey: Buffer}} keys
 * @returns {{seal: (secret: string, tenantId: string) => string, open: (stored: string, tenantId: string) => string}}
 */
export function createSecretBox({ encryptionKey }) {
  if (!Buffer.isBuffer(encryptionKey) || encryptionKey.length !== 32)
    throw new TypeError('encryptionKey must be 32 bytes');

  /**
   * Encrypt `secret` with a fresh random nonce.
   * @param {string} secret
   * @param {string} tenantId
   * @returns {string} Base64 of nonce, authentication tag, and ciphertext.
   */
  function seal(secret, tenantId) {
    const nonce = randomBytes(NONCE_BYTES);
    const cipher = createCipheriv(ALGORITHM, encryptionKey, nonce);
    cipher.setAAD(Buffer.from(tenantId, 'utf8'));
    const body = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return Buffer.concat([nonce, cipher.getAuthTag(), body]).toString('base64');
  }

  /**
   * Decrypt a stored secret for the tenant it belongs to.
   * @param {string} stored `secret_encrypted`.
   * @param {string} tenantId
   * @returns {string}
   * @throws {Error} When the value was altered, belongs to another tenant, or the key is wrong.
   */
  function open(stored, tenantId) {
    const raw = Buffer.from(stored, 'base64');
    const decipher = createDecipheriv(
      ALGORITHM,
      encryptionKey,
      raw.subarray(0, NONCE_BYTES)
    );
    decipher.setAAD(Buffer.from(tenantId, 'utf8'));
    decipher.setAuthTag(raw.subarray(NONCE_BYTES, NONCE_BYTES + TAG_BYTES));
    return Buffer.concat([
      decipher.update(raw.subarray(NONCE_BYTES + TAG_BYTES)),
      decipher.final(),
    ]).toString('utf8');
  }

  return { seal, open };
}
