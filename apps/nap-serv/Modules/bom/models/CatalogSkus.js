'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { TableModel } from 'pg-schemata';
import catalogSkusSchema from '../schemas/catalogSkusSchema.js';

class CatalogSkus extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, catalogSkusSchema, logger);
  }

  async findByEmbeddingIds(embeddingIds) {
    if (!embeddingIds || embeddingIds.length === 0) return {};
    const rows = await this.db.any(
      `SELECT id, embedding_id, description, part_number
       FROM ${this.schemaName}.${this._schema.table}
       WHERE embedding_id IN ($1:csv)`,
      [embeddingIds]
    );
    return rows.reduce((map, row) => {
      map[row.embedding_id] = row;
      return map;
    }, {});
  }
}
export default CatalogSkus;
