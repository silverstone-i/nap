/**
 * @file Roles router — /api/core/v1/roles
 * @module core/apiRoutes/v1/rolesRouter
 *
 * RBAC-gated: core::roles at 'view' for reads, 'full' for mutations.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import { withMeta, rbac } from '../../../../middleware/rbac.js';
import rolesController from '../../controllers/rolesController.js';

const meta = withMeta({ module: 'core', router: 'roles' });

export default createRouter(rolesController, null, {
  getMiddlewares: [meta, rbac('view')],
  postMiddlewares: [meta, rbac('full')],
  putMiddlewares: [meta, rbac('full')],
  deleteMiddlewares: [meta, rbac('full')],
  patchMiddlewares: [meta, rbac('full')],
});
