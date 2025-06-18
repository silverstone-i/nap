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
import napUsersSchema from '../schemas/napUsersSchema.js';
import bcrypt from 'bcrypt';

class NapUsers extends TableModel {
  constructor(db, pgp, logger) {
    super(db, pgp, napUsersSchema, logger);
  }

  async importFromSpreadsheet(rows, options = {}) {
    const processed = await Promise.all(
      rows.map(async row => {
        if (row.password) {
          row.password_hash = await bcrypt.hash(row.password, 10);
          delete row.password;
        }
        return row;
      })
    );
    return super.importFromSpreadsheet(processed, options);
  }
}

export default NapUsers;
