/**
 * @file VendorSkus router — /api/bom/v1/vendor-skus
 * @module bom/apiRoutes/v1/vendorSkusRouter
 *
 * Includes custom endpoints: GET /unmatched, POST /match,
 * POST /auto-match, POST /batch-match, POST /refresh-embeddings.
 *
 * Custom GET routes must be mounted BEFORE createRouter so they
 * are not caught by the generic GET /:id route.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';
import createRouter from '../../../../lib/createRouter.js';
import { moduleEntitlement } from '../../../../middleware/moduleEntitlement.js';
import { withMeta } from '../../../../middleware/withMeta.js';
import vendorSkusController from '../../controllers/vendorSkusController.js';

const router = Router();
const meta = withMeta({ module: 'bom', router: 'vendor-skus' });

// Custom GET routes MUST come before createRouter's /:id catch-all
router.get('/unmatched', meta, moduleEntitlement, (req, res) => vendorSkusController.getUnmatched(req, res));

// Custom POST routes (not caught by /:id, but grouped here for clarity)
router.post('/match', meta, moduleEntitlement, (req, res) => vendorSkusController.match(req, res));
router.post('/auto-match', meta, moduleEntitlement, (req, res) => vendorSkusController.autoMatchEndpoint(req, res));
router.post('/batch-match', meta, moduleEntitlement, (req, res) => vendorSkusController.batchMatchEndpoint(req, res));
router.post('/refresh-embeddings', meta, moduleEntitlement, (req, res) => vendorSkusController.refreshEmbeddings(req, res));

// Standard CRUD routes
router.use('/', createRouter(vendorSkusController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
}));

export default router;
