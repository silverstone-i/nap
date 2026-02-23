/**
 * @file Field group grants router — /api/core/v1/field-group-grants
 * @module core/apiRoutes/v1/fieldGroupGrantsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import fieldGroupGrantsController from '../../controllers/fieldGroupGrantsController.js';
import { withMeta } from '../../../../middleware/withMeta.js';

const meta = withMeta({ module: 'core', router: 'field-group-grants' });

export default createRouter(fieldGroupGrantsController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
