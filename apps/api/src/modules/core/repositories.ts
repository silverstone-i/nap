/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Employees } from './models/Employees.js';
import { Clients } from './models/Clients.js';
import { Vendors } from './models/Vendors.js';
import { VendorContacts } from './models/VendorContacts.js';

/** Does: Registers module tables. Used by: cell composition. */
export const repositories = {
  employees: Employees,
  clients: Clients,
  vendors: Vendors,
  vendor_contacts: VendorContacts,
};
