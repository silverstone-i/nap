// @ts-check

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import schema from '../schemas/exportTemplateCostItemsSchema.js';
import { QueryModel } from 'pg-schemata';

class ExportTemplateCostItems extends QueryModel {
  /**
   * @param {object} db - Database connection
   * @param {object} pgp - pg-promise instance
   * @param {object} logger - Logger instance
   */
  constructor(db, pgp, logger) {
    super(db, pgp, schema, logger);
  }
}

export default ExportTemplateCostItems;
