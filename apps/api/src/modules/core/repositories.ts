/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { AccessEvents } from './models/AccessEvents.js';
import { AssignmentCompanies } from './models/AssignmentCompanies.js';
import { RoleAssignments } from './models/RoleAssignments.js';
import { Roles } from './models/Roles.js';
import { Companies } from './models/Companies.js';
import { Employees } from './models/Employees.js';
import { Clients } from './models/Clients.js';
import { Vendors } from './models/Vendors.js';
import { VendorContacts } from './models/VendorContacts.js';

/** Does: Registers module tables. Used by: cell composition. */
export const repositories = {
  access_events: AccessEvents,
  assignment_companies: AssignmentCompanies,
  role_assignments: RoleAssignments,
  roles: Roles,
  companies: Companies,
  employees: Employees,
  clients: Clients,
  vendors: Vendors,
  vendor_contacts: VendorContacts,
};
