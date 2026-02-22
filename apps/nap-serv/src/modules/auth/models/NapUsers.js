/**
 * @file NapUsers model — extends TableModel for admin.nap_users
 * @module auth/models/NapUsers
 *
 * nap_users is a pure identity/auth table per PRD §3.2.2. Personal
 * information lives on the linked entity record. password_hash is
 * never returned in API responses.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import napUsersSchema from '../schemas/napUsersSchema.js';
import bcrypt from 'bcrypt';

export default class NapUsers extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, napUsersSchema, logger);
  }

  async importFromSpreadsheet(rows, options = {}) {
    const processed = await Promise.all(
      rows.map(async (row) => {
        if (row.password) {
          row.password_hash = await bcrypt.hash(row.password, 10);
          delete row.password;
        }
        return row;
      }),
    );
    return super.importFromSpreadsheet(processed, options);
  }
}
