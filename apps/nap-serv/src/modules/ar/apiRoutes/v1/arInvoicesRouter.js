/**
 * @file AR Invoices router — /api/ar/v1/ar-invoices
 * @module ar/apiRoutes/v1/arInvoicesRouter
 *
 * Includes RBAC-gated approval endpoint per PRD §3.1.2.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';
import createRouter from '../../../../lib/createRouter.js';
import { addAuditFields } from '../../../../middleware/addAuditFields.js';
import { moduleEntitlement } from '../../../../middleware/moduleEntitlement.js';
import { withMeta } from '../../../../middleware/withMeta.js';
import { rbac } from '../../../../middleware/rbac.js';
import arInvoicesController from '../../controllers/arInvoicesController.js';

const router = Router();
const meta = withMeta({ module: 'ar', router: 'ar-invoices' });

// RBAC-gated approval endpoint: PUT /approve
// Requires ar::ar-invoices::approve at 'full' level
router.put(
  '/approve',
  withMeta({ module: 'ar', router: 'ar-invoices', action: 'approve' }),
  moduleEntitlement,
  addAuditFields,
  rbac('full'),
  (req, res) => {
    req.body.status = 'sent';
    return arInvoicesController.update(req, res);
  },
);

router.use('/', createRouter(arInvoicesController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
}));

export default router;
