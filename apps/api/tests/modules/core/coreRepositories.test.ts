/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';

import {
  coreAdminModule,
  coreTenantModule,
} from '../../../src/modules/core/coreRepositories.js';
import { Countries } from '../../../src/modules/core/models/Countries.js';

const TENANT_REPOSITORY_NAMES = [
  'sources',
  'vendors',
  'vendorContacts',
  'clients',
  'employees',
  'contacts',
  'companies',
  'companyMembers',
  'paymentTerms',
  'addresses',
  'phoneNumbers',
  'emails',
  'taxIdentifiers',
  'roles',
  'policies',
  'policyCatalog',
  'stateFilters',
  'fieldGroupDefinitions',
  'fieldGroupGrants',
  'approvals',
  'tenantApprovalConfig',
  'tenantNumberingConfig',
  'tenantNumberSequenceState',
  'tenantPreferences',
];

describe('core module descriptors', () => {
  it('registers two descriptors, one per schema scope (ADR-0005)', () => {
    expect(coreAdminModule.name).toBe('core-admin');
    expect(coreAdminModule.schemaScope).toBe('admin');
    expect(coreTenantModule.name).toBe('core-tenant');
    expect(coreTenantModule.schemaScope).toBe('tenant');
    expect(coreAdminModule.licensable).toBe(false);
    expect(coreTenantModule.licensable).toBe(false);
  });

  it('core-admin declares exactly the countries reference repository', () => {
    expect(coreAdminModule.models).toEqual({ countries: Countries });
    expect(coreAdminModule.migrations).toEqual([]);
  });

  it('core-tenant declares the full §5.3 tenant table set', () => {
    expect(Object.keys(coreTenantModule.models ?? {})).toEqual(
      TENANT_REPOSITORY_NAMES
    );
    expect(coreTenantModule.migrations).toEqual([]);
  });
});
