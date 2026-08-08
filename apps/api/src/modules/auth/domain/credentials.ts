/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { getDb } from '../../../db/index.js';
import {
  getDummyHash,
  hashPassword,
  needsRehash,
  verifyPassword,
} from '../../../util/passwordHash.js';
import type { Argon2Params } from '../../../util/passwordHash.js';
import type { PortalUserRow } from '../models/PortalUsers.js';

/**
 * Equalizes the cost of every refusal path: an unknown email or NULL
 * `password_hash` still pays one argon2id verification, so response timing
 * does not enumerate users (PRD 0004, ADR-0015).
 */
async function burnVerification(password: string): Promise<void> {
  await verifyPassword(await getDummyHash(), password);
}

/**
 * Login credential check (ADR-0015): the authenticated user row on success,
 * null on every refusal — unknown email, no credential, non-active status,
 * wrong password. Callers must emit one identical response for null.
 * A verified hash whose parameters lag `params` is recomputed and stored in
 * the same request (opportunistic rehash).
 */
export async function verifyLogin(
  email: string,
  password: string,
  params: Argon2Params
): Promise<PortalUserRow | null> {
  const db = getDb();
  const user = await db.portalUsers.findOneBy([{ email }]);
  if (user === null || user.password_hash === null) {
    await burnVerification(password);
    return null;
  }
  const matches = await verifyPassword(user.password_hash, password);
  if (!matches || user.status !== 'active') {
    return null;
  }
  if (needsRehash(user.password_hash, params)) {
    await db.portalUsers.updateWhere([{ id: user.id }], {
      password_hash: await hashPassword(password, params),
    });
  }
  return user;
}

/**
 * Password change (PRD 0004): requires the current password; the caller
 * revokes the user's other sessions afterwards. False when the current
 * password is wrong or the user has no credential.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  params: Argon2Params
): Promise<boolean> {
  const db = getDb();
  const user = await db.portalUsers.findOneBy([{ id: userId }]);
  if (user === null || user.password_hash === null) {
    await burnVerification(currentPassword);
    return false;
  }
  const matches = await verifyPassword(user.password_hash, currentPassword);
  if (!matches) {
    return false;
  }
  await db.portalUsers.updateWhere([{ id: userId }], {
    password_hash: await hashPassword(newPassword, params),
  });
  return true;
}
