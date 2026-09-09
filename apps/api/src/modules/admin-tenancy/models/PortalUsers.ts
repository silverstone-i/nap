/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { AuditFields, SoftDelete } from '../../../db/rowFields.js';
import { TableModel } from 'pg-schemata';
import type { DbConnection, Database, TableSchema } from 'pg-schemata';

/**
 * Does: Represents a stored portal_users record.
 * Used by: the PortalUsers repository.
 */
export type PortalUsersRow = {
  id: string;
  must_change_password: boolean;
  email: string;
  password_hash: string;
  status: string;
  is_root: boolean;
} & AuditFields &
  SoftDelete;

/**
 * Does: Declares the columns and constraints of admin.portal_users.
 * Used by: the PortalUsers model.
 */
export const portal_usersSchema: TableSchema = {
  dbSchema: 'admin',
  table: 'portal_users',
  hasAuditFields: {
    enabled: true,
    userFields: {
      type: 'uuid',
    },
  },
  softDelete: true,
  columns: [
    {
      name: 'must_change_password',
      type: 'boolean',
      notNull: true,
      default: false,
    },
    {
      name: 'id',
      type: 'uuid',
      default: 'gen_random_uuid()',
      immutable: true,
    },
    {
      name: 'email',
      type: 'varchar(128)',
      notNull: true,
    },
    {
      name: 'password_hash',
      type: 'text',
      notNull: true,
    },
    {
      name: 'status',
      type: 'text',
      notNull: true,
    },
    {
      name: 'is_root',
      type: 'boolean',
      notNull: true,
      default: false,
    },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: ["status IN ('active', 'locked')"],
    indexes: [
      {
        name: 'portal_users_active_email',
        columns: [{ expression: 'lower(email)' }],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
      {
        columns: ['is_root'],
        unique: true,
        where: 'is_root = true',
      },
    ],
  },
};

/**
 * Does: Reads and writes admin.portal_users through the database library.
 * Called by: the admin repository registry.
 */
export class PortalUsers extends TableModel<PortalUsersRow> {
  /**
   * Does: Binds this model to its transaction or database connection.
   * Called by: the database library when constructing repositories.
   */
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, portal_usersSchema);
  }
  /**
   * Does: Loads and locks a login identity, including locked identities.
   * Called by: authentication services during a request.
   */
  async byEmail(email: string) {
    return this.db.oneOrNone<PortalUsersRow>(
      'SELECT * FROM admin.portal_users WHERE lower(email) = $1 AND deactivated_at IS NULL FOR UPDATE',
      [email]
    );
  }
  /**
   * Does: Locks an identity before checking or changing its credentials.
   * Called by: authentication services during a request.
   */
  async lockIdentity(id: string) {
    return this.db.oneOrNone<PortalUsersRow>(
      'SELECT * FROM admin.portal_users WHERE id = $1 AND deactivated_at IS NULL FOR UPDATE',
      [id]
    );
  }
}
