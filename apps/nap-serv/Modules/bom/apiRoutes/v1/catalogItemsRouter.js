'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

import createRouter from '../../../src/utils/createRouter.js';
import CatalogItemsController from '../controllers/CatalogItemsController.js';

const router = createRouter(CatalogItemsController);

export default router;

