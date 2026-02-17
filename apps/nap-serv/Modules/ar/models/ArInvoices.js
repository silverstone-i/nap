/**
 * @file ArInvoices model — extends TableModel for AR invoice entities
 * @module ar/models/ArInvoices
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import arInvoicesSchema from '../schemas/arInvoicesSchema.js';

export default class ArInvoices extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, arInvoicesSchema, logger);
  }
}
