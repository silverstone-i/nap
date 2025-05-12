'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

import express from 'express';
import ChangeOrderLinesController from '../../controllers/ChangeOrderLinesController.js';

import createRouter from '../../../../src/utils/createRouter.js';

const router = createRouter(ChangeOrderLinesController);

// Add custom route for approving change order lines
router.patch('/change-order-lines/:id/approve', (req, res) =>
  new ChangeOrderLinesController().approve(req, res)
);

export default router;
