/**
 * @file Repository map for the auth module (admin-scope tables)
 * @module auth/authRepositories
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import Tenants from './models/Tenants.js';
import NapUsers from './models/NapUsers.js';
import ImpersonationLogs from './models/ImpersonationLogs.js';
import MatchReviewLogs from './models/MatchReviewLogs.js';

const repositories = {
  tenants: Tenants,
  napUsers: NapUsers,
  impersonationLogs: ImpersonationLogs,
  matchReviewLogs: MatchReviewLogs,
};

export default repositories;
