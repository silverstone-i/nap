/**
 * @file InterCompanyAccounts model — extends TableModel
 * @module accounting/models/InterCompanyAccounts
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import interCompanyAccountsSchema from '../schemas/interCompanyAccountsSchema.js';

export default class InterCompanyAccounts extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, interCompanyAccountsSchema, logger);
  }
}
