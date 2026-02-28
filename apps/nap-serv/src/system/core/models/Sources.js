/**
 * @file Sources model — extends TableModel for polymorphic source linkage
 * @module core/models/Sources
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import sourcesSchema from '../schemas/sourcesSchema.js';

export default class Sources extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, sourcesSchema, logger);
  }
}
