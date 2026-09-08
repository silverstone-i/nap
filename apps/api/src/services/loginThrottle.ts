/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createHmac } from 'node:crypto';
import type { AdminRepositories } from '../db/admin/repositories.js';
import type { AdminTransaction } from '../db/withAdminTransaction.js';

/**
 * Does: Builds separate privacy-preserving email and client-address counter keys.
 * Called by: the login operation before evaluating a password.
 */
export function throttleKeys(email: string, address: string, secret: string) {
  return [
    createHmac('sha256', secret)
      .update('email:' + email)
      .digest('hex'),
    createHmac('sha256', secret)
      .update('address:' + address)
      .digest('hex'),
  ];
}

/**
 * Does: Locks both keys in stable order and checks whether login is throttled.
 * Called by: the login operation inside its transaction.
 */
export async function checkThrottle(
  tx: AdminTransaction<AdminRepositories>,
  keys: string[]
) {
  await tx.login_throttles.lockKeys(keys);
  return tx.login_throttles.locked(keys);
}
