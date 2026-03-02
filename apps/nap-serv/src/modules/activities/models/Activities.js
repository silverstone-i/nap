/**
 * @file Activities model — extends TableModel for activity entities
 * @module activities/models/Activities
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import activitiesSchema from '../schemas/activitiesSchema.js';

export default class Activities extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, activitiesSchema, logger);
  }
}
