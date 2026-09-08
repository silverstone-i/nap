/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { argon2id, hash, verify } from 'argon2';
import type { passwordOptions } from './authConfig.js';

/**
 * Does: Hashes a password with the configured Argon2id cost.
 * Called by: bootstrap and password changes.
 */
export function hashPassword(
  password: string,
  options: ReturnType<typeof passwordOptions>
) {
  return hash(password, { ...options, type: argon2id });
}

/**
 * Does: Checks a password against an Argon2id hash.
 * Called by: login and password changes.
 */
export async function verifyPassword(hash: string, password: string) {
  if (!hash.startsWith('$argon2id$')) throw new Error('Invalid password hash');
  return verify(hash, password);
}
