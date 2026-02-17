/**
 * @file Receipts model — extends TableModel for AR receipt entities
 * @module ar/models/Receipts
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import receiptsSchema from '../schemas/receiptsSchema.js';

export default class Receipts extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, receiptsSchema, logger);
  }
}
