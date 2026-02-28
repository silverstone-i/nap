/**
 * @file Field group definitions router — /api/core/v1/field-group-definitions
 * @module core/apiRoutes/v1/fieldGroupDefinitionsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import fieldGroupDefinitionsController from '../../controllers/fieldGroupDefinitionsController.js';
import { withMeta } from '../../../../middleware/withMeta.js';

const meta = withMeta({ module: 'core', router: 'field-group-definitions' });

export default createRouter(fieldGroupDefinitionsController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
