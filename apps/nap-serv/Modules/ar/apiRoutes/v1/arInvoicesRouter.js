/**
 * @file AR Invoices router — /api/ar/v1/ar-invoices
 * @module ar/apiRoutes/v1/arInvoicesRouter
 *
 * Includes RBAC-gated approval endpoint per PRD §3.1.2.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';
import createRouter from '../../../../src/lib/createRouter.js';
import { addAuditFields } from '../../../../src/middleware/addAuditFields.js';
import { withMeta, rbac } from '../../../../src/middleware/rbac.js';
import arInvoicesController from '../../controllers/arInvoicesController.js';

const router = Router();

// RBAC-gated approval endpoint: PUT /approve
// Requires ar::ar-invoices::approve at 'full' level
router.put(
  '/approve',
  addAuditFields,
  withMeta({ module: 'ar', router: 'ar-invoices', action: 'approve' }),
  rbac('full'),
  (req, res) => {
    req.body.status = 'sent';
    return arInvoicesController.update(req, res);
  },
);

router.use('/', createRouter(arInvoicesController));

export default router;
