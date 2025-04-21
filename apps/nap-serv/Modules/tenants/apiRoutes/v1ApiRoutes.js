'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import napUserRoutes from './v1/napUserApi.js';
import tenantRoutes from './v1/tenantApi.js';

const tenantApiRoutes = [napUserRoutes, tenantRoutes];

export default tenantApiRoutes;
