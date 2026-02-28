/**
 * @file ArInvoiceLines model — extends TableModel
 * @module ar/models/ArInvoiceLines
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import arInvoiceLinesSchema from '../schemas/arInvoiceLinesSchema.js';

export default class ArInvoiceLines extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, arInvoiceLinesSchema, logger);
  }
}
