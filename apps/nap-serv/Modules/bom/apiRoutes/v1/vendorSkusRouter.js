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
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';
import createRouter from '../../../../src/lib/createRouter.js';
import vendorSkusController from '../../controllers/vendorSkusController.js';

const router = Router();

// Custom GET routes MUST come before createRouter's /:id catch-all
router.get('/unmatched', (req, res) => vendorSkusController.getUnmatched(req, res));

// Custom POST routes (not caught by /:id, but grouped here for clarity)
router.post('/match', (req, res) => vendorSkusController.match(req, res));
router.post('/auto-match', (req, res) => vendorSkusController.autoMatchEndpoint(req, res));
router.post('/batch-match', (req, res) => vendorSkusController.batchMatchEndpoint(req, res));
router.post('/refresh-embeddings', (req, res) => vendorSkusController.refreshEmbeddings(req, res));

// Standard CRUD routes
router.use('/', createRouter(vendorSkusController));

export default router;
