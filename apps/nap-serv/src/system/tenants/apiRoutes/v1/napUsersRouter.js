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
import { withMeta } from '../../../../middleware/withMeta.js';

const meta = withMeta({ module: 'tenants', router: 'nap-users' });

// Note: RBAC enforcement deferred to Phase 5 (no role_members exist yet).
// requireNapsoftTenant gates all routes to NapSoft users only.
export default createRouter(
  napUsersController,
  (router) => {
    router.post(
      '/register',
      requireNapsoftTenant,
      meta,
      addAuditFields,
      (req, res) => napUsersController.register(req, res),
    );
  },
  {
    disablePost: true,
    getMiddlewares: [requireNapsoftTenant, meta],
    putMiddlewares: [requireNapsoftTenant, meta],
    deleteMiddlewares: [requireNapsoftTenant, meta],
    patchMiddlewares: [requireNapsoftTenant, meta],
  },
);
