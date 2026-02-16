/**
 * @file NapUsers router — user CRUD with custom /register endpoint per PRD §3.2.2
 * @module tenants/apiRoutes/v1/napUsersRouter
 *
 * Standard POST is disabled; users must be created via /register.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import napUsersController from '../../controllers/napUsersController.js';
import createRouter from '../../../../lib/createRouter.js';
import { addAuditFields } from '../../../../middleware/addAuditFields.js';

export default createRouter(
  napUsersController,
  (router) => {
    router.post('/register', addAuditFields, (req, res) => napUsersController.register(req, res));
  },
  {
    disablePost: true,
  },
);
