/**
 * @file Inter-companies router — /api/core/v1/inter-companies
 * @module core/apiRoutes/v1/interCompaniesRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import interCompaniesController from '../../controllers/interCompaniesController.js';
import { withMeta } from '../../../../middleware/withMeta.js';

const meta = withMeta({ module: 'core', router: 'inter-companies' });

export default createRouter(interCompaniesController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
