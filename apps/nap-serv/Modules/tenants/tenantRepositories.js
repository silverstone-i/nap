'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import Tenants from './models/Tenants.js';
import NapUsers from './models/NapUsers.js';

// TODO: implement a more robust way to handle this.
//
// We need more control over the order that repositories are loaded so we can take constraints into account.
// For example, we need to ensure that the NapUsers table is created before the Tenants table.
// This is because the NapUsers table is used by the Tenants table to store the user_id column.
// Further we need control over which tables are loaded for a tenant so that only the modules they need are deployed
const tenantRepositories = {
  napUsers: NapUsers,
  tenants: Tenants,
};

export default tenantRepositories;
