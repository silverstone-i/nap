/**
 * @file Budgets model — extends TableModel for budget entities
 * @module activities/models/Budgets
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import budgetsSchema from '../schemas/budgetsSchema.js';

export default class Budgets extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, budgetsSchema, logger);
  }
}
