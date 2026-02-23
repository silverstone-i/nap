/**
 * @file State filters router — /api/core/v1/state-filters
 * @module core/apiRoutes/v1/stateFiltersRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import stateFiltersController from '../../controllers/stateFiltersController.js';
import { withMeta } from '../../../../middleware/withMeta.js';

const meta = withMeta({ module: 'core', router: 'state-filters' });

export default createRouter(stateFiltersController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
