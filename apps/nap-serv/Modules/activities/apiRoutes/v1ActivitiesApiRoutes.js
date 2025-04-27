'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

import activityApiRoutes from './v1/activityApi.js';
import categoryApiRoutes from './v1/categoryApi.js';
import costLineApiRoutes from './v1/costLineApi.js';

const v1ActivitiesApiRoutes = [activityApiRoutes, categoryApiRoutes, costLineApiRoutes];
export default v1ActivitiesApiRoutes;

