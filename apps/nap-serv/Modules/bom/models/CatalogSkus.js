import { TableModel } from 'pg-schemata';
import catalogSkusSchema from '../schemas/catalogSkusSchema.js';

class CatalogSkus extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, catalogSkusSchema, logger);
  }

  async getCatalogEmbeddings() {
    const query = `
      SELECT id, catalog_sku, description, description_normalized, embedding
      FROM "${this.schema.dbSchema}"."${this.schema.table}"
      WHERE embedding IS NOT NULL
    `;
    const rows = await this.db.any(query);
    // Parse embedding if it's a string
    return rows.map(row => ({
      ...row,
      embedding: Array.isArray(row.embedding) ? row.embedding : typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding,
    }));
  }

  async getNormalizedDescriptions() {
    const query = `
      SELECT id, description_normalized
      FROM "${this.schema.dbSchema}"."${this.schema.table}"
      WHERE description_normalized IS NOT NULL
    `;
    return await this.db.any(query);
  }

  // Add custom methods as needed
}

export default CatalogSkus;
