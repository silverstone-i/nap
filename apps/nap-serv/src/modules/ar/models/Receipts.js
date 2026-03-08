/**
 * @file Receipts model — extends TableModel
 * @module ar/models/Receipts
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import receiptsSchema from '../schemas/receiptsSchema.js';

export default class Receipts extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, receiptsSchema, logger);
  }
}
