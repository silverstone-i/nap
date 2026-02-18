/**
 * @file AR Invoices router — /api/ar/v1/ar-invoices
 * @module ar/apiRoutes/v1/arInvoicesRouter
 *
 * Includes RBAC enforcement for the approve action per PRD §3.1.2.
 * The withMeta middleware annotates req.resource so that the
 * ar::ar-invoices::approve policy can restrict approval rights.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';
import createRouter from '../../../../src/lib/createRouter.js';
import { addAuditFields } from '../../../../src/middleware/addAuditFields.js';
import { withMeta } from '../../../../src/middleware/rbac.js';
import { rbac } from '../../../../src/middleware/rbac.js';
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
    // Set status to 'sent' (approval = sending the invoice to the client)
    req.body.status = 'sent';
    return arInvoicesController.update(req, res);
  },
);

// Standard CRUD routes
router.use('/', createRouter(arInvoicesController));

export default router;
