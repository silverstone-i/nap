/**
 * @file Tax identifiers router — /api/core/v1/tax-identifiers
 * @module core/apiRoutes/v1/taxIdentifiersRouter
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import taxIdentifiersController from '../../controllers/taxIdentifiersController.js';
import { withMeta } from '../../../../middleware/withMeta.js';

const meta = withMeta({ module: 'core' });

export default createRouter(taxIdentifiersController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
