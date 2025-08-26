'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import categoriesController from '../../controllers/CategoriesController.js';
import createRouter from '../../../../src/utils/createRouter.js';

const router = createRouter(categoriesController);

export default router;
