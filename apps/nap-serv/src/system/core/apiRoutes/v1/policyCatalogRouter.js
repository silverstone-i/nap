/**
 * @file PolicyCatalog router — /api/core/v1/policy-catalog (read-only)
 * @module core/apiRoutes/v1/policyCatalogRouter
 *
 * Exposes GET-only endpoints. All mutation routes are disabled because
 * policy_catalog is seed-only reference data.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import policyCatalogController from '../../controllers/policyCatalogController.js';
import { withMeta } from '../../../../middleware/withMeta.js';

const meta = withMeta({ module: 'core', router: 'policy-catalog' });

export default createRouter(policyCatalogController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
  disablePost: true,
  disablePut: true,
  disableDelete: true,
  disablePatch: true,
  disableBulkInsert: true,
  disableBulkUpdate: true,
  disableImportXls: true,
});
