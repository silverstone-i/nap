// @ts-check

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

// Update this import to match the actual exported member from 'pg-schemata'
import { QueryModel } from 'pg-schemata';
import schema from '../schemas/exportTemplateTasksSchema.js';

class ExportTemplateTasks extends QueryModel {
  /**
   * @param {object} db - Database connection
   * @param {object} pgp - pg-promise instance
   * @param {object} logger - Logger instance
   */
  constructor(db, pgp, logger = null) {
    super(db, pgp, schema, logger);
  }
}

export default ExportTemplateTasks;
