/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `admin.portal_users`: portal accounts, password hashes, account status, and the root-user marker.
 * Kept identical to the copy frozen in migration `001-admin-tenancy`.
 */
export const portalUsersSchema = {
  dbSchema: 'admin',
  table: 'portal_users',
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
    { name: 'email', type: 'varchar(254)', notNull: true },
    { name: 'password_hash', type: 'text', notNull: true },
    {
      name: 'must_change_password',
      type: 'boolean',
      notNull: true,
      default: true,
    },
    { name: 'status', type: 'text', notNull: true, default: 'active' },
    {
      name: 'is_root',
      type: 'boolean',
      notNull: true,
      default: false,
      immutable: true,
    },
  ],
  constraints: {
    primaryKey: ['id'],
    checks: ["status IN ('active', 'locked', 'disabled')"],
    indexes: [
      {
        name: 'portal_users_active_email',
        columns: [{ expression: 'lower(email)' }],
        unique: true,
        where: 'deactivated_at IS NULL',
      },
      { columns: ['is_root'], unique: true, where: 'is_root = true' },
    ],
  },
};

/**
 * Qualified table name for a model instance.
 *
 * A module function rather than a private getter, for the reason given in
 * `sessions.js`: `forSchema` clones a model with `Object.create`, which does
 * not carry private fields.
 * @param {PortalUsers} model
 * @returns {string}
 */
function table(model) {
  return `${model.schemaName}.${model.tableName}`;
}

/**
 * Model for `admin.portal_users`.
 *
 * Reads go through the inherited table operations with an explicit
 * `columnWhitelist`, so `password_hash` reaches only `domain/credentials.js`.
 * The two credential writes below are raw SQL because each has to be one
 * statement and neither may return the hash it just stored.
 */
export class PortalUsers extends TableModel {
  static schema = portalUsersSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, portalUsersSchema, logger);
  }

  /**
   * Store a new password hash and clear the replacement requirement.
   *
   * One statement, so M0001-03-R006 holds at the storage layer as well as in
   * the transaction around it: there is no moment at which the new hash is
   * stored and `must_change_password` is still set.
   *
   * The eligibility predicates are the guard against a concurrent disable or
   * archive. An operator revoking an account between the caller's status check
   * and this update matches no row, and the caller reports the refusal rather
   * than resurrecting the account's ability to log in. The `protect_root`
   * trigger constrains `email`, `status`, `is_root`, and `deactivated_at`, not
   * these two columns, so the root account can replace its own password.
   * @param {string} id Portal user, who is also the actor.
   * @param {string} passwordHash
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<{id: string}|null>} `null` when the account is no longer eligible.
   */
  async replacePassword(id, passwordHash, { tx }) {
    return tx.oneOrNone(
      `UPDATE ${table(this)} AS u
          SET password_hash=$2,must_change_password=false,updated_by=$1
        WHERE u.id=$1 AND u.deactivated_at IS NULL AND u.status='active'
        RETURNING u.id`,
      [id, passwordHash]
    );
  }

  /**
   * Replace a password hash with a stronger encoding of the same password.
   *
   * Deliberately leaves `must_change_password` alone: a temporary password
   * that is rehashed after a parameter increase is still a temporary password.
   * @param {string} id
   * @param {string} passwordHash
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<{id: string}|null>}
   */
  async rehashPassword(id, passwordHash, { tx }) {
    return tx.oneOrNone(
      `UPDATE ${table(this)} AS u SET password_hash=$2,updated_by=$1
        WHERE u.id=$1 AND u.deactivated_at IS NULL AND u.status='active'
        RETURNING u.id`,
      [id, passwordHash]
    );
  }
}
