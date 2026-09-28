/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `app.roles`: named sets of capability patterns in one
 * tenant (M0003-R001). `(tenant_id, code)` is unique including archived roles.
 * Kept identical to the copy frozen in migration `001-access-control`.
 */
export const rolesSchema = {
  dbSchema: 'app',
  table: 'roles',
  hasAuditFields: { enabled: true, userFields: { type: 'uuid' } },
  softDelete: true,
  columns: [
    {
      name: 'id',
      type: 'uuid',
      notNull: true,
      default: 'gen_random_uuid()',
      immutable: true,
    },
    { name: 'tenant_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'code', type: 'varchar(64)', notNull: true, immutable: true },
    { name: 'name', type: 'varchar(160)', notNull: true },
    { name: 'description', type: 'varchar(512)' },
    {
      name: 'is_immutable',
      type: 'boolean',
      notNull: true,
      default: false,
      immutable: true,
    },
    { name: 'revision', type: 'integer', notNull: true, default: 1 },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [
      ['tenant_id', 'code'],
      ['tenant_id', 'id'],
    ],
    checks: ['revision > 0'],
  },
};

/**
 * Model for `app.roles`. Row-level security limits every statement to the
 * tenant in `nap.tenant_id`, so callers pass the transaction that set it.
 */
export class Roles extends TableModel {
  static schema = rolesSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, rolesSchema, logger);
  }

  /**
   * Lock and return a tenant's role by code, archived or not.
   * @param {string} tenantId
   * @param {string} code
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object|null>}
   */
  async lockByCode(tenantId, code, { tx }) {
    return tx.oneOrNone(
      `SELECT * FROM ${this.schemaName}.${this.tableName}
        WHERE tenant_id=$1 AND code=$2 FOR UPDATE`,
      [tenantId, code]
    );
  }

  /**
   * Lock and return a role by ID, archived or not.
   * @param {string} id
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object|null>}
   */
  async lockById(id, { tx }) {
    return tx.oneOrNone(
      `SELECT * FROM ${this.schemaName}.${this.tableName}
        WHERE id=$1 FOR UPDATE`,
      [id]
    );
  }

  /**
   * Return a role by ID, archived or not.
   * @param {string} id
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object|null>}
   */
  async byId(id, { tx }) {
    return tx.oneOrNone(
      `SELECT * FROM ${this.schemaName}.${this.tableName} WHERE id=$1`,
      [id]
    );
  }

  /**
   * Several roles by identifier in one query; missing identifiers are simply
   * absent from the result.
   * @param {string[]} ids
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object[]>}
   */
  async byIds(ids, { tx }) {
    if (ids.length === 0) return [];
    return tx.any(
      `SELECT * FROM ${this.schemaName}.${this.tableName}
        WHERE id = ANY($1::uuid[])`,
      [ids]
    );
  }

  /**
   * The tenant's roles ordered by code, optionally including archived ones.
   * @param {{tx: import('pg-promise').IDatabase<unknown>, includeArchived?: boolean}} options
   * @returns {Promise<object[]>}
   */
  async list({ tx, includeArchived = false }) {
    return tx.any(
      `SELECT * FROM ${this.schemaName}.${this.tableName}
        WHERE $1 OR deactivated_at IS NULL ORDER BY code, id`,
      [includeArchived]
    );
  }

  /**
   * Write a new revision of a role: optionally its name and description, and
   * whether it is archived. `revision` advances by one. The caller has
   * locked the row and checked the expected revision.
   * @param {string} id
   * @param {{name?: string, description?: string|null, archived?: boolean}} changes
   * @param {string} actorId Portal user recorded in `updated_by`.
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object>} The updated row.
   */
  async saveRevision(id, changes, actorId, { tx }) {
    const has = key => Object.hasOwn(changes, key);
    return tx.one(
      `UPDATE ${this.schemaName}.${this.tableName}
          SET name = CASE WHEN $2 THEN $3 ELSE name END,
              description = CASE WHEN $4 THEN $5 ELSE description END,
              deactivated_at = CASE WHEN NOT $6 THEN deactivated_at
                                    WHEN $7 THEN COALESCE(deactivated_at, now())
                                    ELSE NULL END,
              revision = revision + 1,
              updated_by = $8
        WHERE id=$1
        RETURNING *`,
      [
        id,
        has('name'),
        changes.name ?? null,
        has('description'),
        changes.description ?? null,
        has('archived'),
        changes.archived === true,
        actorId,
      ]
    );
  }
}
