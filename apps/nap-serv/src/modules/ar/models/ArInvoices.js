/**
 * @file ArInvoices model — extends TableModel
 * @module ar/models/ArInvoices
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import arInvoicesSchema from '../schemas/arInvoicesSchema.js';

export default class ArInvoices extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, arInvoicesSchema, logger);
  }
}
