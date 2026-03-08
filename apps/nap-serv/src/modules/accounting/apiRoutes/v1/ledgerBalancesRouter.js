/**
 * @file Ledger Balances router — /api/accounting/v1/ledger-balances (read-only)
 * @module accounting/apiRoutes/v1/ledgerBalancesRouter
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import ledgerBalancesController from '../../controllers/ledgerBalancesController.js';
import { withMeta } from '../../../../middleware/withMeta.js';

const meta = withMeta({ module: 'accounting', router: 'ledger-balances' });

export default createRouter(ledgerBalancesController, null, {
  getMiddlewares: [meta],
  postMiddlewares: [meta],
  putMiddlewares: [meta],
  deleteMiddlewares: [meta],
  patchMiddlewares: [meta],
  disablePost: true,
  disablePut: true,
  disableDelete: true,
  disablePatch: true,
  disableBulkInsert: true,
  disableBulkUpdate: true,
  disableImportXls: true,
});
