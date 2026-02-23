/**
 * @file Repository map for the core module (tenant-scope)
 * @module core/coreRepositories
 *
 * RBAC tables created in Phase 3. Entity tables added in Phase 5.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import Roles from './models/Roles.js';
import Policies from './models/Policies.js';
import PolicyCatalog from './models/PolicyCatalog.js';
import StateFilters from './models/StateFilters.js';
import FieldGroupDefinitions from './models/FieldGroupDefinitions.js';
import FieldGroupGrants from './models/FieldGroupGrants.js';
import ProjectMembers from './models/ProjectMembers.js';
import CompanyMembers from './models/CompanyMembers.js';

// Phase 5 — Core entity tables
import Sources from './models/Sources.js';
import Vendors from './models/Vendors.js';
import Clients from './models/Clients.js';
import Employees from './models/Employees.js';
import Contacts from './models/Contacts.js';
import Addresses from './models/Addresses.js';
import PhoneNumbers from './models/PhoneNumbers.js';
import InterCompanies from './models/InterCompanies.js';

const repositories = {
  // RBAC (Phase 3)
  roles: Roles,
  policies: Policies,
  policyCatalog: PolicyCatalog,
  stateFilters: StateFilters,
  fieldGroupDefinitions: FieldGroupDefinitions,
  fieldGroupGrants: FieldGroupGrants,
  projectMembers: ProjectMembers,
  companyMembers: CompanyMembers,

  // Core entities (Phase 5)
  sources: Sources,
  vendors: Vendors,
  clients: Clients,
  employees: Employees,
  contacts: Contacts,
  addresses: Addresses,
  phoneNumbers: PhoneNumbers,
  interCompanies: InterCompanies,
};

export default repositories;
