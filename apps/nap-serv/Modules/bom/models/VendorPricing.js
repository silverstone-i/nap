/**
 * @file VendorPricing model — extends TableModel for time-based vendor pricing
 * @module bom/models/VendorPricing
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import vendorPricingSchema from '../schemas/vendorPricingSchema.js';

export default class VendorPricing extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, vendorPricingSchema, logger);
  }
}
