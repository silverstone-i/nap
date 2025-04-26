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

const repositories = {
  napUsers: NapUsers,
  tenants: Tenants,
};

export default repositories;
