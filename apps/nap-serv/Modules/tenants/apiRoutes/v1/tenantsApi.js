'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import tenantsController from '../../controllers/TenantsController.js';
import createRouter from '../../../../src/utils/createRouter.js';
import { requireNapsoftTenant } from '../../../../middlewares/access/requireNapsoftTenant.js';

export default createRouter(
  tenantsController,
  router => {
    router.route('/:id/modules').get((req, res) => tenantsController.getAllAllowedModules(req, res));
  },
  {
    postMiddlewares: [requireNapsoftTenant],
    getMiddlewares: [requireNapsoftTenant],
    putMiddlewares: [requireNapsoftTenant],
    deleteMiddlewares: [requireNapsoftTenant],
    patchMiddlewares: [requireNapsoftTenant],
  }
);
