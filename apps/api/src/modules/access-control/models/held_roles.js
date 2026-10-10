/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `app.held_roles`: a role chosen for a person who is not
 * yet an active member, waiting to be assigned when the membership activates
 * (I0010-R006, R007). Keyed by the person's party ID, because the login does
 * not exist in the cell until its membership copy arrives. `party_id` has no
 * foreign key: `business-directory` creates `app.parties` after this module.
 * `created_by` is the user who chose the role, the actor of the later
 * assignment (I0010 §12). Kept identical to the copy frozen in migration
 * `001-access-control`.
 */
export const heldRolesSchema = {
  dbSchema: 'app',
  table: 'held_roles',
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
    { name: 'party_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'role_id', type: 'uuid', notNull: true, immutable: true },
  ],
  constraints: {
    primaryKey: ['id'],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['tenant_id', 'role_id'],
        references: {
          schema: 'app',
          table: 'roles',
          columns: ['tenant_id', 'id'],
        },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      {
        columns: ['party_id', 'role_id'],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
      { columns: ['role_id'] },
    ],
  },
};

/** Model for `app.held_roles`. Subject to the tenant row-level security rule. */
export class HeldRoles extends TableModel {
  static schema = heldRolesSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, heldRolesSchema, logger);
  }

  /**
   * Lock and return a person's active held roles.
   * @param {string} partyId
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<{id: string, role_id: string, created_by: string|null}[]>}
   */
  async lockActive(partyId, { tx }) {
    return tx.any(
      `SELECT id, role_id, created_by FROM ${this.schemaName}.${this.tableName}
        WHERE party_id=$1 AND deactivated_at IS NULL
        ORDER BY created_at, id FOR UPDATE`,
      [partyId]
    );
  }

  /**
   * Active held role IDs for a set of people.
   * @param {string[]} partyIds
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<{party_id: string, role_id: string}[]>}
   */
  async activeFor(partyIds, { tx }) {
    if (partyIds.length === 0) return [];
    return tx.any(
      `SELECT party_id, role_id FROM ${this.schemaName}.${this.tableName}
        WHERE party_id = ANY($1::uuid[]) AND deactivated_at IS NULL`,
      [partyIds]
    );
  }

  /**
   * Hold one role for a person, recording who chose it.
   * @param {{tenantId: string, partyId: string, roleId: string, actorId: string}} row
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<void>}
   */
  async hold({ tenantId, partyId, roleId, actorId }, { tx }) {
    await tx.none(
      `INSERT INTO ${this.schemaName}.${this.tableName}
         (tenant_id, party_id, role_id, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$4)`,
      [tenantId, partyId, roleId, actorId]
    );
  }

  /**
   * Release one held role, recording who released it.
   * @param {string} id
   * @param {string|null} actorId
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<void>}
   */
  async release(id, actorId, { tx }) {
    await tx.none(
      `UPDATE ${this.schemaName}.${this.tableName}
          SET deactivated_at = now(), updated_by = $2
        WHERE id=$1 AND deactivated_at IS NULL`,
      [id, actorId]
    );
  }
}
