/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { NapModule } from '../../db/index.js';
import { Addresses } from './models/Addresses.js';
import { Approvals } from './models/Approvals.js';
import { Clients } from './models/Clients.js';
import { Companies } from './models/Companies.js';
import { CompanyMembers } from './models/CompanyMembers.js';
import { Contacts } from './models/Contacts.js';
import { Countries } from './models/Countries.js';
import { Emails } from './models/Emails.js';
import { Employees } from './models/Employees.js';
import { FieldGroupDefinitions } from './models/FieldGroupDefinitions.js';
import { FieldGroupGrants } from './models/FieldGroupGrants.js';
import { PaymentTerms } from './models/PaymentTerms.js';
import { PhoneNumbers } from './models/PhoneNumbers.js';
import { Policies } from './models/Policies.js';
import { PolicyCatalog } from './models/PolicyCatalog.js';
import { Roles } from './models/Roles.js';
import { Sources } from './models/Sources.js';
import { StateFilters } from './models/StateFilters.js';
import { TaxIdentifiers } from './models/TaxIdentifiers.js';
import { TenantApprovalConfig } from './models/TenantApprovalConfig.js';
import { TenantNumberingConfig } from './models/TenantNumberingConfig.js';
import { TenantNumberSequenceState } from './models/TenantNumberSequenceState.js';
import { TenantPreferences } from './models/TenantPreferences.js';
import { VendorContacts } from './models/VendorContacts.js';
import { Vendors } from './models/Vendors.js';

declare module 'pg-schemata' {
  interface Repositories {
    countries: Countries;
    sources: Sources;
    vendors: Vendors;
    vendorContacts: VendorContacts;
    clients: Clients;
    employees: Employees;
    contacts: Contacts;
    companies: Companies;
    companyMembers: CompanyMembers;
    paymentTerms: PaymentTerms;
    addresses: Addresses;
    phoneNumbers: PhoneNumbers;
    emails: Emails;
    taxIdentifiers: TaxIdentifiers;
    roles: Roles;
    policies: Policies;
    policyCatalog: PolicyCatalog;
    stateFilters: StateFilters;
    fieldGroupDefinitions: FieldGroupDefinitions;
    fieldGroupGrants: FieldGroupGrants;
    approvals: Approvals;
    tenantApprovalConfig: TenantApprovalConfig;
    tenantNumberingConfig: TenantNumberingConfig;
    tenantNumberSequenceState: TenantNumberSequenceState;
    tenantPreferences: TenantPreferences;
  }
}

/**
 * Registry descriptors for the core module. Core owns tables in both schema
 * scopes, and `schemaScope` is single-valued (ADR-0005), so it registers two
 * descriptors: `core-admin` for the shared reference data and `core-tenant`
 * for the per-tenant master data, RBAC, and shared configuration.
 */
export const coreAdminModule: NapModule = {
  name: 'core-admin',
  schemaScope: 'admin',
  licensable: false,
  models: { countries: Countries },
  migrations: [],
};

export const coreTenantModule: NapModule = {
  name: 'core-tenant',
  schemaScope: 'tenant',
  licensable: false,
  models: {
    sources: Sources,
    vendors: Vendors,
    vendorContacts: VendorContacts,
    clients: Clients,
    employees: Employees,
    contacts: Contacts,
    companies: Companies,
    companyMembers: CompanyMembers,
    paymentTerms: PaymentTerms,
    addresses: Addresses,
    phoneNumbers: PhoneNumbers,
    emails: Emails,
    taxIdentifiers: TaxIdentifiers,
    roles: Roles,
    policies: Policies,
    policyCatalog: PolicyCatalog,
    stateFilters: StateFilters,
    fieldGroupDefinitions: FieldGroupDefinitions,
    fieldGroupGrants: FieldGroupGrants,
    approvals: Approvals,
    tenantApprovalConfig: TenantApprovalConfig,
    tenantNumberingConfig: TenantNumberingConfig,
    tenantNumberSequenceState: TenantNumberSequenceState,
    tenantPreferences: TenantPreferences,
  },
  migrations: [],
};
