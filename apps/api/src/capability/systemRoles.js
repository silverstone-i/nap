/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Route capabilities (`module::router::action`) the interim authorization in
 * `admin-tenancy/domain/authorization.js` gives the bootstrap login.
 */
export const PLATFORM_ADMIN_CAPABILITIES = Object.freeze([
  'admin-tenancy::control::read',
  'admin-tenancy::control::write',
  'admin-tenancy::accounts::read',
  'admin-tenancy::accounts::write',
  'admin-tenancy::roles::read',
  'admin-tenancy::roles::write',
  'admin-tenancy::sessions::revoke',
  'admin-tenancy::entitlements::read',
  'admin-tenancy::entitlements::write',
  'admin-tenancy::events::read',
  // M0003 §4. Interim: the bootstrap login manages its selected tenant's
  // roles until I0005's decision model replaces this list (step 2.3).
  'access-control::roles::read',
  'access-control::roles::write',
  'access-control::assignments::write',
]);
