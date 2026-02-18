/**
 * @file Policy Catalog router — /api/core/v1/policy-catalog
 * @module core/apiRoutes/v1/policyCatalogRouter
 *
 * Read-only: exposes the seed-only policy_catalog table for client discovery.
 * RBAC-gated: core::policy-catalog at 'view' for reads.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import { withMeta, rbac } from '../../../../middleware/rbac.js';
import policyCatalogController from '../../controllers/policyCatalogController.js';

const meta = withMeta({ module: 'core', router: 'policy-catalog' });

export default createRouter(policyCatalogController, null, {
  getMiddlewares: [meta, rbac('view')],
  // Disable all mutation routes — catalog is seed-only
  disablePost: true,
  disablePut: true,
  disableDelete: true,
  disablePatch: true,
  disableBulkInsert: true,
  disableBulkUpdate: true,
  disableImportXls: true,
});
