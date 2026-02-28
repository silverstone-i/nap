/**
 * @file Clients router — /api/core/v1/clients
 * @module core/apiRoutes/v1/clientsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import clientsController from '../../controllers/clientsController.js';
import { withMeta } from '../../../../middleware/withMeta.js';

const meta = withMeta({ module: 'core', router: 'clients' });

export default createRouter(clientsController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
