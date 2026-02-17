/**
 * @file CostLines model — extends TableModel for cost line entities
 * @module activities/models/CostLines
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import costLinesSchema from '../schemas/costLinesSchema.js';

export default class CostLines extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, costLinesSchema, logger);
  }
}
