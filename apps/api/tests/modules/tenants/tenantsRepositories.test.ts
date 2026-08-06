/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';

import { createTables } from '../../../src/db/index.js';
import { Tenants } from '../../../src/modules/tenants/models/Tenants.js';
import { tenantsModule } from '../../../src/modules/tenants/tenantsRepositories.js';

describe('tenants module descriptor', () => {
  it('registers as an admin-scope, non-licensable module', () => {
    expect(tenantsModule.name).toBe('tenants');
    expect(tenantsModule.schemaScope).toBe('admin');
    expect(tenantsModule.licensable).toBe(false);
  });

  it('declares the tenants repository and the create-tables migration', () => {
    expect(Object.keys(tenantsModule.models ?? {})).toEqual(['tenants']);
    expect(tenantsModule.models?.tenants).toBe(Tenants);
    expect(tenantsModule.migrations).toEqual([createTables]);
  });
});
