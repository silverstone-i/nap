import { TableModel } from 'pg-schemata';
import catalogSkusSchema from '../schemas/catalogSkusSchema.js';

class CatalogSkus extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, catalogSkusSchema, logger);
  }
  // Add custom methods as needed
}

export default CatalogSkus;
