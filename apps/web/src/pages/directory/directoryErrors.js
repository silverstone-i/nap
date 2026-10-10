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
  ADMIN_ASSIGNED:
    'This person holds an administrator role. Remove the role on the Roles screen first.',
  GRANT_EXCEEDS_ACTOR:
    'You can only give roles whose permissions you hold yourself.',
  LAST_ADMIN:
    'This person is the tenant’s last administrator. Give the role to someone else first.',
  CONFLICT: 'That name is already used, or the record changed. Try again.',
  NOT_FOUND: 'That record no longer exists.',
  CELL_UNAVAILABLE: 'The tenant’s database is unavailable. Try again later.',
};

/** Messages for portal-access failures (I0008), which reuse shared codes. */
export const PORTAL_MESSAGES = Object.freeze({
  turnOn: {
    INVALID_INPUT:
      'Turning on portal access needs a primary email, a temporary password, and at least one role.',
    INVALID_STATE: 'An archived person cannot get portal access.',
  },
  turnOff: {
    INVALID_STATE: 'You cannot turn off your own portal access.',
  },
  archive: {
    INVALID_STATE: 'You cannot archive yourself while you have portal access.',
  },
  email: {
    INVALID_STATE:
      'This person’s primary email is locked while portal access is on. Turn portal access off, change the email, then turn it back on.',
  },
});

/** Plain-words reason for a failed request (I0008-R009). */
const FAILURES = Object.freeze({
  LOGIN_UNAVAILABLE:
    'This login is disabled. Ask Napsoft support to re-enable it.',
  MEMBER_CONFLICT:
    'This email’s login already belongs to another person in this tenant.',
});

/**
 * The reason text for a failure code.
 * @param {string|null} code
 * @returns {string}
 */
export function portalFailureMessage(code) {
  return FAILURES[code] ?? 'Contact Napsoft support.';
}

/**
 * Map a directory failure to a message.
 * @param {unknown} err
 * @param {Record<string, string>} [overrides] Messages for this action, by code.
 * @returns {string}
 */
export function describeDirectoryError(err, overrides = {}) {
  if (!(err instanceof ApiError))
    return 'Something went wrong. Please try again.';
  if (err.code === 'FORBIDDEN') return denialMessage(err);
  return (
    overrides[err.code] ??
    MESSAGES[err.code] ??
    'Something went wrong. Please try again.'
  );
}

/**
 * Whether the failure was a stale revision, so the caller should reload.
 * @param {unknown} err
 * @returns {boolean}
 */
export function isStaleRevision(err) {
  return err instanceof ApiError && err.code === 'STALE_REVISION';
}
