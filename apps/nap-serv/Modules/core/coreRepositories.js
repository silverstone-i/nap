'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import Vendors from './models/Vendors.js';
import Contacts from './models/Contacts.js';
import Addresses from './models/Addresses.js';
import InterCompanies from './models/InterCompanies.js';
import Clients from './models/Clients.js';
import Employees from './models/Employees.js';
import Sources from './models/Sources.js';
import Roles from './models/Roles.js';
import RoleMembers from './models/RoleMembers.js';
import Policies from './models/Policies.js';

const repositories = {
  vendors: Vendors,
  contacts: Contacts,
  addresses: Addresses,
  interCompanies: InterCompanies,
  clients: Clients,
  employees: Employees,
  sources: Sources,
  roles: Roles,
  roleMembers: RoleMembers,
  policies: Policies,
};
export default repositories;
