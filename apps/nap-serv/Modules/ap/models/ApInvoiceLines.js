/**
 * @file ApInvoiceLines model — extends TableModel for AP invoice line entities
 * @module ap/models/ApInvoiceLines
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import apInvoiceLinesSchema from '../schemas/apInvoiceLinesSchema.js';

export default class ApInvoiceLines extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, apInvoiceLinesSchema, logger);
  }
}
