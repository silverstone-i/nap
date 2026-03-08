/**
 * @file Categories model — extends TableModel for cost category entities
 * @module activities/models/Categories
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import categoriesSchema from '../schemas/categoriesSchema.js';

export default class Categories extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, categoriesSchema, logger);
  }
}
