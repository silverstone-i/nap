/**
 * @file CostItems model — extends TableModel for task cost items
 * @module projects/models/CostItems
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import costItemsSchema from '../schemas/costItemsSchema.js';

export default class CostItems extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, costItemsSchema, logger);
  }
}
