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

/** Columns safe to return outside the authentication-only credential lookup: every column but `password_hash`. */
const SAFE_COLUMNS = 'id,email,must_change_password,status,is_root';

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

  /**
   * Lock and return the root portal user, if one has been bootstrapped.
   *
   * Excludes `password_hash`: bootstrap's identity check needs only the
   * email to detect a conflict, and M0001-01-R006 confines the hash to the
   * authentication-only credential lookup.
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object|null>}
   */
  async lockRoot({ tx }) {
    return tx.oneOrNone(
      `SELECT ${SAFE_COLUMNS} FROM ${table(this)}
        WHERE is_root=true AND deactivated_at IS NULL FOR UPDATE`
    );
  }

  /**
   * Lock and return a portal user by identifier, archived or not.
   *
   * Excludes `password_hash`, matching every other read on this model:
   * M0001-08's account operations never need the digest, only the account's
   * own fields.
   * @param {string} id
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object|null>}
   */
  async lockById(id, { tx }) {
    return tx.oneOrNone(
      `SELECT ${SAFE_COLUMNS},deactivated_at FROM ${table(this)}
        WHERE id=$1 FOR UPDATE`,
      [id]
    );
  }

  /**
   * Lock and return the active portal user registered under `email`, if any.
   * @param {string} email Normalized (trimmed, lowercased) email.
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object|null>}
   */
  async lockActiveByEmail(email, { tx }) {
    return tx.oneOrNone(
      `SELECT ${SAFE_COLUMNS} FROM ${table(this)}
        WHERE lower(email)=lower($1) AND deactivated_at IS NULL FOR UPDATE`,
      [email]
    );
  }

  /**
   * Insert the root portal user, returning every column but `password_hash`.
   *
   * A bespoke insert rather than the inherited one: that method's
   * `RETURNING *` would hand the digest it just stored back to its caller,
   * and bootstrap's caller is a CLI that prints its result to stdout —
   * exactly what M0001-02-R006 forbids.
   *
   * `must_change_password` starts `false`: root authority comes from
   * `is_root = true` alone (M0001-05-R001), not from a session restricted
   * until a password change, so there is nothing to force on first login.
   * @param {{email: string, passwordHash: string}} user
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object>}
   */
  async insertRoot({ email, passwordHash }, { tx }) {
    return tx.one(
      `INSERT INTO ${table(this)}
         (email,password_hash,must_change_password,status,is_root,created_by,updated_by)
       VALUES ($1,$2,false,'active',true,NULL,NULL)
       RETURNING ${SAFE_COLUMNS}`,
      [email, passwordHash]
    );
  }
}
