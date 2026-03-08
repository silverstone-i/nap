/**
 * @file Numbering config router — /api/core/v1/numbering-config
 * @module core/apiRoutes/v1/numberingConfigRouter
 *
 * Config rows are pre-seeded during tenant provisioning.
 * Archive/restore/bulk-insert/import/export are disabled — use PUT /update
 * to toggle is_enabled and modify format fields.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import numberingConfigController from '../../controllers/numberingConfigController.js';
import { withMeta } from '../../../../middleware/withMeta.js';

const meta = withMeta({ module: 'core', router: 'numbering-config' });

export default createRouter(numberingConfigController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
  disableDelete: true,
  disablePatch: true,
  disableBulkInsert: true,
  disableImportXls: true,
  disableExportXls: true,
});
