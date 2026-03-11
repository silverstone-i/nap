/**
 * @file Employees router — /api/core/v1/employees
 * @module core/apiRoutes/v1/employeesRouter
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import employeesController from '../../controllers/employeesController.js';
import { addAuditFields } from '../../../../middleware/addAuditFields.js';
import { moduleEntitlement } from '../../../../middleware/moduleEntitlement.js';
import { rbac } from '../../../../middleware/rbac.js';
import { withMeta } from '../../../../middleware/withMeta.js';

const meta = withMeta({ module: 'core', router: 'employees' });

export default createRouter(
  employeesController,
  (router) => {
    router.get(
      '/:id/source-id',
      meta,
      moduleEntitlement,
      rbac('view'),
      (req, res) => employeesController.getSourceId(req, res),
    );
    router.post(
      '/:id/reset-password',
      withMeta({ module: 'core', router: 'employees', action: 'reset-password' }),
      moduleEntitlement,
      addAuditFields,
      rbac('full'),
      (req, res) => employeesController.resetPassword(req, res),
    );
  },
  {
    getMiddlewares: [meta],
    postMiddlewares: [meta],
    putMiddlewares: [meta],
    deleteMiddlewares: [meta],
    patchMiddlewares: [meta],
  },
);
