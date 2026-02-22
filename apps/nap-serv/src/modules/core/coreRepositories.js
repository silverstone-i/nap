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

const repositories = {
  roles: Roles,
  policies: Policies,
  policyCatalog: PolicyCatalog,
  stateFilters: StateFilters,
  fieldGroupDefinitions: FieldGroupDefinitions,
  fieldGroupGrants: FieldGroupGrants,
  projectMembers: ProjectMembers,
  companyMembers: CompanyMembers,
};

export default repositories;
