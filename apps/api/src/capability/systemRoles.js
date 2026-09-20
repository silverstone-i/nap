/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
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
  'admin-tenancy::access::support',
]);
