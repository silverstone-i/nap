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
import createRouter from '../../../../src/utils/createRouter.js'
export default createRouter(tenantsController, (router) => {
  router.route('/:id/modules').get((req, res) => tenantsController.getAllAllowedModules(req, res));
});
