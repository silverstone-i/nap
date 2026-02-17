/**
 * @file Tasks model — extends TableModel for unit-level task instances
 * @module projects/models/Tasks
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import tasksSchema from '../schemas/tasksSchema.js';

export default class Tasks extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, tasksSchema, logger);
  }
}
