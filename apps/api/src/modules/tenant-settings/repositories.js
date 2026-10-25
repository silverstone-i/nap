/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TenantSettings } from './models/tenant_settings.js';

/** Table name to model class map used to build cell database repositories, in creation order. */
export const repositories = {
  tenant_settings: TenantSettings,
};
