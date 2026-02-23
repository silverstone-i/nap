/**
 * @file InterCompanyTransactions model — extends TableModel
 * @module accounting/models/InterCompanyTransactions
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import interCompanyTransactionsSchema from '../schemas/interCompanyTransactionsSchema.js';

export default class InterCompanyTransactions extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, interCompanyTransactionsSchema, logger);
  }
}
