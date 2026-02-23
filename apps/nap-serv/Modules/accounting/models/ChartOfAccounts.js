/**
 * @file ChartOfAccounts model — extends TableModel
 * @module accounting/models/ChartOfAccounts
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import chartOfAccountsSchema from '../schemas/chartOfAccountsSchema.js';

export default class ChartOfAccounts extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, chartOfAccountsSchema, logger);
  }
}
