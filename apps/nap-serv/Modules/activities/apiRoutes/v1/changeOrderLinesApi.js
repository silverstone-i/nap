'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

import changeOrderLinesController from '../../controllers/ChangeOrderLinesController.js';

import createRouter from '../../../../src/utils/createRouter.js';

const router = createRouter(changeOrderLinesController);

// Add custom route for approving change order lines
router.patch('/approve/:id', (req, res) =>
  changeOrderLinesController.approve(req, res)
);

// Add custom route for locking change order lines by unit budget
router.patch('/lock/:id', (req, res) =>
  changeOrderLinesController.lockByUnitBudget(req, res)
);

export default router;
