/**
 * @file State filters router — /api/core/v1/state-filters
 * @module core/apiRoutes/v1/stateFiltersRouter
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import stateFiltersController from '../../controllers/stateFiltersController.js';
import { withMeta } from '../../../../middleware/withMeta.js';
import { addAuditFields } from '../../../../middleware/addAuditFields.js';
import { moduleEntitlement } from '../../../../middleware/moduleEntitlement.js';

const meta = withMeta({ module: 'core', router: 'state-filters' });

export default createRouter(
  stateFiltersController,
  (router) => {
    router.put('/sync-for-role', addAuditFields, meta, moduleEntitlement, (req, res) => stateFiltersController.syncForRole(req, res));
  },
  {
    getMiddlewares: [meta],
    postMiddlewares: [meta],
    putMiddlewares: [meta],
    deleteMiddlewares: [meta],
    patchMiddlewares: [meta],
  },
);
