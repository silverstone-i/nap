/**
 * @file Employees router — /api/core/v1/employees
 * @module core/apiRoutes/v1/employeesRouter
 *
 * RBAC-gated: core::employees at 'view' for reads, 'full' for mutations.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import { withMeta, rbac } from '../../../../middleware/rbac.js';
import employeesController from '../../controllers/employeesController.js';

const meta = withMeta({ module: 'core', router: 'employees' });

export default createRouter(employeesController, null, {
  getMiddlewares: [meta, rbac('view')],
  postMiddlewares: [meta, rbac('full')],
  putMiddlewares: [meta, rbac('full')],
  deleteMiddlewares: [meta, rbac('full')],
  patchMiddlewares: [meta, rbac('full')],
});
