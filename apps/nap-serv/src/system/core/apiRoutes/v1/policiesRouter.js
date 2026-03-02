/**
 * @file Policies router — /api/core/v1/policies
 * @module core/apiRoutes/v1/policiesRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import policiesController from '../../controllers/policiesController.js';
import { withMeta } from '../../../../middleware/withMeta.js';
import { addAuditFields } from '../../../../middleware/addAuditFields.js';
import { moduleEntitlement } from '../../../../middleware/moduleEntitlement.js';

const meta = withMeta({ module: 'core', router: 'policies' });

export default createRouter(
  policiesController,
  (router) => {
    router.put('/sync-for-role', addAuditFields, meta, moduleEntitlement, (req, res) => policiesController.syncForRole(req, res));
  },
  {
    getMiddlewares: [meta],
    postMiddlewares: [meta],
    putMiddlewares: [meta],
    deleteMiddlewares: [meta],
    patchMiddlewares: [meta],
  },
);
