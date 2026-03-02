/**
 * @file VendorParts model — extends TableModel for vendor part/SKU pricing
 * @module activities/models/VendorParts
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import vendorPartsSchema from '../schemas/vendorPartsSchema.js';

export default class VendorParts extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, vendorPartsSchema, logger);
  }
}
