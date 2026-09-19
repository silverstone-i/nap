/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod';
import { AdminAccessError, withDatabaseErrors } from './errors.js';
import { parseNormalizedEmail } from './validation.js';

/**
 * The only view that may include `password_hash`. Kept out of
 * `access.js` so an ordinary caller cannot reach it by mistake.
 */
export const CREDENTIAL_VIEW_COLUMNS = [
  'id',
  'email',
  'password_hash',
  'must_change_password',
  'status',
  'is_root',
];

const authenticationContextSchema = z.strictObject({
  caller: z.literal('authentication'),
});

/**
 * Validate the marker that admits a caller to the credential reader.
 * @param {unknown} authenticationContext
 * @returns {void}
 * @throws {AdminAccessError} `INVALID_INPUT`
 */
function requireAuthenticationContext(authenticationContext) {
  if (!authenticationContextSchema.safeParse(authenticationContext).success)
    throw new AdminAccessError('INVALID_INPUT');
}

/**
 * Find a portal user's login fields, including the password hash, by
 * normalized email. The only method in this module that may return
 * `password_hash`; reserved for the authentication operation.
 * @param {import('./access.js').AdminTenancyDb} db
 * @param {unknown} authenticationContext Marker `{ caller: 'authentication' }`.
 * @param {unknown} normalizedEmail Email already lowercased by the caller.
 * @returns {Promise<object|null>} Login fields and password hash, or `null` if missing or archived.
 * @throws {AdminAccessError} `INVALID_INPUT`, `CONFLICT`, `INTERNAL_ERROR`
 */
export async function findCredentialByEmail(
  db,
  authenticationContext,
  normalizedEmail
) {
  requireAuthenticationContext(authenticationContext);
  const email = parseNormalizedEmail(normalizedEmail);
  return withDatabaseErrors(async () => {
    const row = await db.portal_users.findOneBy(
      { email },
      { columnWhitelist: CREDENTIAL_VIEW_COLUMNS }
    );
    return row ?? null;
  });
}
