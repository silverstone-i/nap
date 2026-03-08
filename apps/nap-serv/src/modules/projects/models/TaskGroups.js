/**
 * @file TaskGroups model
 * @module projects/models/TaskGroups
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import taskGroupsSchema from '../schemas/taskGroupsSchema.js';

export default class TaskGroups extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, taskGroupsSchema, logger);
  }
}
