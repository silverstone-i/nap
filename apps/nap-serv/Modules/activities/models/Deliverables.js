/**
 * @file Deliverables model — extends TableModel for deliverable entities
 * @module activities/models/Deliverables
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import deliverablesSchema from '../schemas/deliverablesSchema.js';

export default class Deliverables extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, deliverablesSchema, logger);
  }
}
