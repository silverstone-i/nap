/**
 * @file Repository map for the tenants module (admin-scope)
 * @module tenants/tenantsRepositories
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import Tenants from './models/Tenants.js';
import NapUsers from './models/NapUsers.js';
import NapUserAddresses from './models/NapUserAddresses.js';
import NapUserPhones from './models/NapUserPhones.js';
import MatchReviewLogs from './models/MatchReviewLogs.js';

const repositories = {
  tenants: Tenants,
  napUsers: NapUsers,
  napUserAddresses: NapUserAddresses,
  napUserPhones: NapUserPhones,
  matchReviewLogs: MatchReviewLogs,
};

export default repositories;
