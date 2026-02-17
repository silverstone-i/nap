/**
 * @file Ledger Balances controller — read-only queries
 * @module accounting/controllers/ledgerBalancesController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import ViewController from '../../../src/lib/ViewController.js';

class LedgerBalancesController extends ViewController {
  constructor() {
    super('ledgerBalances', 'ledger-balance');
  }
}

const instance = new LedgerBalancesController();
export default instance;
export { LedgerBalancesController };
