/**
 * @file Role Members router — /api/core/v1/role-members
 * @module core/apiRoutes/v1/roleMembersRouter
 *
 * RBAC-gated: core::role-members at 'full' for all operations.
 * Custom endpoints: PUT /sync, DELETE /remove.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import { addAuditFields } from '../../../../middleware/addAuditFields.js';
import { withMeta, rbac } from '../../../../middleware/rbac.js';
import roleMembersController from '../../controllers/roleMembersController.js';

const meta = withMeta({ module: 'core', router: 'role-members' });

export default createRouter(
  roleMembersController,
  (router) => {
    router.put('/sync', addAuditFields, meta, rbac('full'), (req, res) =>
      roleMembersController.sync(req, res),
    );
    router.delete('/remove', meta, rbac('full'), (req, res) =>
      roleMembersController.remove(req, res),
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
