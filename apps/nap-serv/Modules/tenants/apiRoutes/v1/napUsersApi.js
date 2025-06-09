'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */


import napUsersController from '../../controllers/NapUsersController.js';
import createRouter from '../../../../src/utils/createRouter.js';
import { addAuditFields } from '../../../../middlewares/audit/addAuditFields.js';

export default createRouter(
  napUsersController,
  router => {
    router.post('/register', addAuditFields, (req, res) =>
      napUsersController.register(req, res)
    ); // Register a new user
  },
  {
    disablePost: true,
  }
);
