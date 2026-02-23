/**
 * @file Phone numbers router — /api/core/v1/phone-numbers
 * @module core/apiRoutes/v1/phoneNumbersRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import phoneNumbersController from '../../controllers/phoneNumbersController.js';
import { withMeta } from '../../../../middleware/withMeta.js';

const meta = withMeta({ module: 'core', router: 'phone-numbers' });

export default createRouter(phoneNumbersController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
});
