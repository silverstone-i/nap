/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Roles } from './models/roles.js';
import { RoleGrants } from './models/role_grants.js';
import { RoleAssignments } from './models/role_assignments.js';
import { HeldRoles } from './models/held_roles.js';

/** Table name to model class map used to build cell database repositories. */
export const repositories = {
  roles: Roles,
  role_grants: RoleGrants,
  role_assignments: RoleAssignments,
  held_roles: HeldRoles,
};
