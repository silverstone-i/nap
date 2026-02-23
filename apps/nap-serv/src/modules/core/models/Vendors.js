/**
 * @file Vendors model — extends TableModel for tenant-scope vendors
 * @module core/models/Vendors
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import vendorsSchema from '../schemas/vendorsSchema.js';

export default class Vendors extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, vendorsSchema, logger);
  }
}
