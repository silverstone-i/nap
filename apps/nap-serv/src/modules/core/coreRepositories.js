/**
 * @file Repository map for the core module (tenant-scope)
 * @module core/coreRepositories
 *
 * Includes RBAC tables (Phase 2) and core entity tables (Phase 7).
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import Roles from './models/Roles.js';
import RoleMembers from './models/RoleMembers.js';
import Policies from './models/Policies.js';
import PolicyCatalog from './models/PolicyCatalog.js';
import ProjectMembers from './models/ProjectMembers.js';
import CompanyMembers from './models/CompanyMembers.js';
import StateFilters from './models/StateFilters.js';
import FieldGroupDefinitions from './models/FieldGroupDefinitions.js';
import FieldGroupGrants from './models/FieldGroupGrants.js';
import Sources from './models/Sources.js';
import Vendors from './models/Vendors.js';
import Clients from './models/Clients.js';
import Employees from './models/Employees.js';
import Contacts from './models/Contacts.js';
import Addresses from './models/Addresses.js';
import InterCompanies from './models/InterCompanies.js';

const repositories = {
  // RBAC (Phase 2 + Layers 2-4)
  roles: Roles,
  roleMembers: RoleMembers,
  policies: Policies,
  policyCatalog: PolicyCatalog,
  projectMembers: ProjectMembers,
  companyMembers: CompanyMembers,
  stateFilters: StateFilters,
  fieldGroupDefinitions: FieldGroupDefinitions,
  fieldGroupGrants: FieldGroupGrants,
  // Core entities (Phase 7)
  sources: Sources,
  vendors: Vendors,
  clients: Clients,
  employees: Employees,
  contacts: Contacts,
  addresses: Addresses,
  interCompanies: InterCompanies,
};

export default repositories;
