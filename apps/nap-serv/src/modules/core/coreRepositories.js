/**
 * @file Repository map for the core module (tenant-scope, RBAC tables for Phase 2)
 * @module core/coreRepositories
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import Roles from './models/Roles.js';
import RoleMembers from './models/RoleMembers.js';
import Policies from './models/Policies.js';

const repositories = {
  roles: Roles,
  roleMembers: RoleMembers,
  policies: Policies,
};

export default repositories;
