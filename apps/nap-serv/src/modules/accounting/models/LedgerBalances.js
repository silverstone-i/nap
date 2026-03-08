/**
 * @file LedgerBalances model — extends TableModel
 * @module accounting/models/LedgerBalances
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import ledgerBalancesSchema from '../schemas/ledgerBalancesSchema.js';

export default class LedgerBalances extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, ledgerBalancesSchema, logger);
  }
}
