/**
 * @file ActualCosts model — extends TableModel for actual cost entities
 * @module activities/models/ActualCosts
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import actualCostsSchema from '../schemas/actualCostsSchema.js';

export default class ActualCosts extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, actualCostsSchema, logger);
  }
}
