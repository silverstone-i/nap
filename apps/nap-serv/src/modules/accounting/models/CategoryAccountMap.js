/**
 * @file CategoryAccountMap model — extends TableModel
 * @module accounting/models/CategoryAccountMap
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import categoryAccountMapSchema from '../schemas/categoryAccountMapSchema.js';

export default class CategoryAccountMap extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, categoryAccountMapSchema, logger);
  }
}
