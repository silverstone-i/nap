/**
 * @file Employees router — /api/core/v1/employees
 * @module core/apiRoutes/v1/employeesRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import employeesController from '../../controllers/employeesController.js';
import { addAuditFields } from '../../../../middleware/addAuditFields.js';
import { withMeta } from '../../../../middleware/withMeta.js';

const meta = withMeta({ module: 'core', router: 'employees' });

export default createRouter(
  employeesController,
  (router) => {
    router.post(
      '/:id/reset-password',
      meta,
      addAuditFields,
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
