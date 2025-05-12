'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

import unitBudgetsController from '../../controllers/UnitBudgetsController.js';
import createRouter from '../../../../src/utils/createRouter.js';

const router = createRouter(unitBudgetsController);

router.route('/:id/submit').post((req, res) => unitBudgetsController.submit(req, res));
router.route('/:id/approve').post((req, res) => unitBudgetsController.approve(req, res));

export default router;