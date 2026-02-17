/**
 * @file TasksMaster model — extends TableModel for master task library
 * @module projects/models/TasksMaster
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import tasksMasterSchema from '../schemas/tasksMasterSchema.js';

export default class TasksMaster extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, tasksMasterSchema, logger);
  }
}
