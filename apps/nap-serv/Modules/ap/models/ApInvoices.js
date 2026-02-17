/**
 * @file ApInvoices model — extends TableModel for AP invoice entities
 * @module ap/models/ApInvoices
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import apInvoicesSchema from '../schemas/apInvoicesSchema.js';

export default class ApInvoices extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, apInvoicesSchema, logger);
  }
}
