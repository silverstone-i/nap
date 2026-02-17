/**
 * @file Units model — extends TableModel for project unit entities
 * @module projects/models/Units
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import unitsSchema from '../schemas/unitsSchema.js';

export default class Units extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, unitsSchema, logger);
  }
}
