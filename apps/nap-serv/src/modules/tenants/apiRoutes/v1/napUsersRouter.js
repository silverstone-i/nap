/**
 * @file NapUsers router — user CRUD with custom /register endpoint per PRD §3.2.2
 * @module tenants/apiRoutes/v1/napUsersRouter
 *
 * Standard POST is disabled; users must be created via /register.
 * All routes gated by requireNapsoftTenant + RBAC (tenants::nap-users).
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import napUsersController from '../../controllers/napUsersController.js';
import createRouter from '../../../../lib/createRouter.js';
import { addAuditFields } from '../../../../middleware/addAuditFields.js';
import { requireNapsoftTenant } from '../../../../middleware/requireNapsoftTenant.js';
import { withMeta, rbac } from '../../../../middleware/rbac.js';

const meta = withMeta({ module: 'tenants', router: 'nap-users' });

export default createRouter(
  napUsersController,
  (router) => {
    router.post('/register', requireNapsoftTenant, meta, rbac('full'), addAuditFields, (req, res) => napUsersController.register(req, res));
  },
  {
    disablePost: true,
    getMiddlewares: [requireNapsoftTenant, meta, rbac('view')],
    putMiddlewares: [requireNapsoftTenant, meta, rbac('full')],
    deleteMiddlewares: [requireNapsoftTenant, meta, rbac('full')],
    patchMiddlewares: [requireNapsoftTenant, meta, rbac('full')],
  },
);
