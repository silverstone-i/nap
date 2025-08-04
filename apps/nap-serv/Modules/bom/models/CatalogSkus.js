import { TableModel } from 'pg-schemata';
import catalogSkusSchema from '../schemas/catalogSkusSchema.js';

class CatalogSkus extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, catalogSkusSchema, logger);
  }

  async getCatalogEmbeddings() {
    const query = `
      SELECT id, embedding
      FROM "${this.schema.dbSchema}"."${this.schema.table}"
      WHERE embedding IS NOT NULL
    `;
    return await this.db.any(query);
  }

  // Add custom methods as needed
}

export default CatalogSkus;
