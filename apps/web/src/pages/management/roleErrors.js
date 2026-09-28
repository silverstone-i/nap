/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file Readable messages for the access-control API's error codes
 * (M0003 §10), shared by the Roles screen's page and dialogs.
 */

import { ApiError } from '../../api/client.js';
import { denialMessage } from '../../auth/capabilities.js';

const MESSAGES = {
  ROLE_IMMUTABLE: 'This role is immutable and cannot be changed.',
  STALE_REVISION:
    'Someone else changed this role. It has been reloaded — review and try again.',
  GRANT_EXCEEDS_ACTOR:
    'You cannot grant or manage access beyond what you hold yourself.',
  NOT_MEMBER: 'This user is not an active member of the selected tenant.',
  LAST_ADMIN: 'This would remove the last administrator.',
  CONFLICT: 'A role with this code already exists.',
  INVALID_INPUT: 'Check the fields and grant patterns.',
  VALIDATION: 'Check the fields and grant patterns.',
  INVALID_STATE: 'Select a tenant first.',
  NOT_FOUND: 'This role or user no longer exists.',
};

/**
 * @param {unknown} err
 * @returns {string}
 */
export function describeRoleError(err) {
  if (err instanceof ApiError && err.code === 'FORBIDDEN')
    return denialMessage(err);
  if (err instanceof ApiError && MESSAGES[err.code]) return MESSAGES[err.code];
  return 'Something went wrong. Please try again.';
}

/**
 * @param {unknown} err
 * @returns {boolean} Whether the failure means the role must be reloaded.
 */
export function isStaleRevision(err) {
  return err instanceof ApiError && err.code === 'STALE_REVISION';
}
