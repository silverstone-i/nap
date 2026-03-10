/**
 * @file Tax identifiers model — typed tax IDs linked to entities via sources
 * @module core/models/TaxIdentifiers
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import taxIdentifiersSchema from '../schemas/taxIdentifiersSchema.js';

export default class TaxIdentifiers extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, taxIdentifiersSchema, logger);
  }
}
