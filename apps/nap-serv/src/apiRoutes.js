'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import tenantApiRoutes from '../modules/tenants/apiRoutes/v1ApiRoutes.js';
import activitiesApiRoutes from '../modules/activities/apiRoutes/v1ActivitiesApiRoutes.js';
import coreApiRoutes from '../modules/core/apiRoutes/v1CoreApiRoutes.js';
// Future imports for other modules can go here
// import accountingApiRoutes from '../modules/accounting/apiRoutes/v1ApiRoutes.js';


// Simulated list of modules per tenant - replace with dynamic logic as needed
const enabledModules = ['core', 'activities', 'tenants']; // TODO: Load dynamically per tenant or env config

const allRoutes = {
  tenants: {
    prefix: 'tenants/v1',
    routes: tenantApiRoutes,
  },
  activities: {
    prefix: 'activities/v1',
    routes: activitiesApiRoutes,
  },
  core: {
    prefix: 'core/v1',
    routes: coreApiRoutes, 
  },
  // accounting: {
  //   prefix: 'accounting/v1',
  //   routes: accountingApiRoutes,
  // },
};

// Dynamically build routes based on enabled modules
const apiRoutes = enabledModules
  .map((module) => allRoutes[module])
  .filter(Boolean);

export default apiRoutes;
