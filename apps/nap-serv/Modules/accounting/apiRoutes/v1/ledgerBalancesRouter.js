/**
 * @file Ledger Balances router — /api/accounting/v1/ledger-balances (read-only)
 * @module accounting/apiRoutes/v1/ledgerBalancesRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../src/lib/createRouter.js';
import ledgerBalancesController from '../../controllers/ledgerBalancesController.js';

export default createRouter(ledgerBalancesController, null, {
  disablePost: true,
  disablePut: true,
  disableDelete: true,
  disablePatch: true,
  disableBulkInsert: true,
  disableBulkUpdate: true,
  disableImportXls: true,
});
