import { TableModel } from 'pg-schemata';
import vendorPricingSchema from '../schemas/vendorPricingSchema.js';

class VendorPricing extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, vendorPricingSchema, logger);
  }
  // Add custom methods as needed
}

export default VendorPricing;
