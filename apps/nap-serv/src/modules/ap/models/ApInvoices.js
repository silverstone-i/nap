/**
 * @file ApInvoices model — extends TableModel
 * @module ap/models/ApInvoices
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import apInvoicesSchema from '../schemas/apInvoicesSchema.js';

export default class ApInvoices extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, apInvoicesSchema, logger);
  }
}
