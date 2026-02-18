/**
 * @file Policies router — /api/core/v1/policies
 * @module core/apiRoutes/v1/policiesRouter
 *
 * RBAC-gated: core::policies at 'full' for all operations.
 * Custom endpoint: PUT /sync-for-role.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import { addAuditFields } from '../../../../middleware/addAuditFields.js';
import { withMeta, rbac } from '../../../../middleware/rbac.js';
import policiesController from '../../controllers/policiesController.js';

const meta = withMeta({ module: 'core', router: 'policies' });

export default createRouter(
  policiesController,
  (router) => {
    router.put('/sync-for-role', addAuditFields, meta, rbac('full'), (req, res) =>
      policiesController.syncForRole(req, res),
    );
  },
  {
    getMiddlewares: [meta, rbac('view')],
    postMiddlewares: [meta, rbac('full')],
    putMiddlewares: [meta, rbac('full')],
    deleteMiddlewares: [meta, rbac('full')],
    patchMiddlewares: [meta, rbac('full')],
  },
);
