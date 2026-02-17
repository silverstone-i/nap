/**
 * @file TemplateTasks model — extends TableModel for template task definitions
 * @module projects/models/TemplateTasks
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import templateTasksSchema from '../schemas/templateTasksSchema.js';

export default class TemplateTasks extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, templateTasksSchema, logger);
  }
}
