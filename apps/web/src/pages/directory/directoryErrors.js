/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { ApiError } from '../../api/client.js';
import { denialMessage } from '../../auth/capabilities.js';

/** Message for each directory error code (M0005 §10). */
const MESSAGES = {
  INVALID_INPUT:
    'Check the highlighted fields. A vendor needs a tax ID, and a client needs its own tax ID or one primary tax contact, not both.',
  INVALID_STATE: 'An employee must keep a primary email.',
  STALE_REVISION:
    'Someone else changed this record. It has been reloaded; try again.',
  PRIMARY_TAX_CONTACT:
    'This buyer is the client’s primary tax contact. Choose another first.',
  CONFLICT: 'That name is already used, or the record changed. Try again.',
  NOT_FOUND: 'That record no longer exists.',
  CELL_UNAVAILABLE: 'The tenant’s database is unavailable. Try again later.',
};

/**
 * Map a directory failure to a message.
 * @param {unknown} err
 * @returns {string}
 */
export function describeDirectoryError(err) {
  if (!(err instanceof ApiError))
    return 'Something went wrong. Please try again.';
  if (err.code === 'FORBIDDEN') return denialMessage(err);
  return MESSAGES[err.code] ?? 'Something went wrong. Please try again.';
}

/**
 * Whether the failure was a stale revision, so the caller should reload.
 * @param {unknown} err
 * @returns {boolean}
 */
export function isStaleRevision(err) {
  return err instanceof ApiError && err.code === 'STALE_REVISION';
}
