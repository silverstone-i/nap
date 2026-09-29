/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { Parties } from './models/parties.js';
import { People } from './models/people.js';
import { Organizations } from './models/organizations.js';
import { OrganizationContacts } from './models/organization_contacts.js';
import { ContactLabels } from './models/contact_labels.js';
import { ContactMethods } from './models/contact_methods.js';
import { Addresses } from './models/addresses.js';
import { TenantContacts } from './models/tenant_contacts.js';

/** Table name to model class map used to build cell database repositories, in creation order. */
export const repositories = {
  parties: Parties,
  people: People,
  organizations: Organizations,
  organization_contacts: OrganizationContacts,
  contact_labels: ContactLabels,
  contact_methods: ContactMethods,
  addresses: Addresses,
  tenant_contacts: TenantContacts,
};
