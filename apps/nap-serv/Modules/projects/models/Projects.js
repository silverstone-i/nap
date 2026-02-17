/**
 * @file Projects model — extends TableModel for project entities
 * @module projects/models/Projects
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import projectsSchema from '../schemas/projectsSchema.js';

export default class Projects extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, projectsSchema, logger);
  }
}
