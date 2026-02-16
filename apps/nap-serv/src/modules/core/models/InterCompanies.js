/**
 * @file InterCompanies model — extends TableModel for intercompany entities
 * @module core/models/InterCompanies
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import interCompaniesSchema from '../schemas/interCompaniesSchema.js';

export default class InterCompanies extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, interCompaniesSchema, logger);
  }
}
