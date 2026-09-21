/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `admin.sessions`: hashed session credentials, expiry, selected tenant, and support-access attribution.
 * Kept identical to the copy frozen in migration `001-admin-tenancy`.
 */
export const sessionsSchema = {
  dbSchema: 'admin',
  table: 'sessions',
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
    { name: 'portal_user_id', type: 'uuid', notNull: true, immutable: true },
    { name: 'token_hash', type: 'text', notNull: true },
    { name: 'tenant_id', type: 'uuid' },
    { name: 'access_mode', type: 'text', notNull: true, default: 'normal' },
    { name: 'effective_user_id', type: 'uuid' },
    { name: 'access_reason', type: 'varchar(512)' },
    { name: 'access_expires_at', type: 'timestamptz' },
    {
      name: 'last_seen_at',
      type: 'timestamptz',
      notNull: true,
      default: 'now()',
    },
    { name: 'idle_expires_at', type: 'timestamptz', notNull: true },
    { name: 'absolute_expires_at', type: 'timestamptz', notNull: true },
  ],
  constraints: {
    primaryKey: ['id'],
    unique: [['token_hash']],
    checks: [
      "access_mode IN ('normal', 'support')",
      "(access_mode = 'normal' AND effective_user_id IS NULL AND access_reason IS NULL AND access_expires_at IS NULL) OR (access_mode = 'support' AND tenant_id IS NOT NULL AND access_reason IS NOT NULL AND access_expires_at IS NOT NULL)",
      'idle_expires_at <= absolute_expires_at',
    ],
    foreignKeys: [
      {
        type: 'ForeignKey',
        columns: ['portal_user_id'],
        references: { schema: 'admin', table: 'portal_users', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['effective_user_id'],
        references: { schema: 'admin', table: 'portal_users', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
      {
        type: 'ForeignKey',
        columns: ['tenant_id'],
        references: { schema: 'admin', table: 'tenants', columns: ['id'] },
        onDelete: 'RESTRICT',
      },
    ],
    indexes: [
      { columns: ['portal_user_id'] },
      { columns: ['tenant_id'] },
      { columns: ['absolute_expires_at'] },
    ],
  },
};

/**
 * Safe projection of `admin.sessions`. `token_hash` is absent by
 * construction: no method on this model may return it, which is half of
 * M0001-04-R008. The other half is that the plaintext token is never stored.
 */
export const SESSION_VIEW_COLUMNS = Object.freeze([
  'id',
  'portal_user_id',
  'tenant_id',
  'access_mode',
  'effective_user_id',
  'access_reason',
  'access_expires_at',
  'last_seen_at',
  'idle_expires_at',
  'absolute_expires_at',
  'created_at',
  'updated_at',
  'deactivated_at',
]);

const viewColumns = SESSION_VIEW_COLUMNS.map(column => `s.${column}`).join(',');

/**
 * Qualified table name for a model instance.
 *
 * A module function rather than a private getter: `forSchema` clones a model
 * with `Object.create`, which does not carry private fields, so a clone would
 * throw on the first statement.
 * @param {Sessions} model
 * @returns {string}
 */
function table(model) {
  return `${model.schemaName}.${model.tableName}`;
}

/**
 * Model for `admin.sessions`.
 *
 * Every method below is raw SQL rather than an inherited table operation
 * because session state changes must be decided by PostgreSQL, not by the
 * API process. Expiry, the idle extension, and the rotation guard all compare
 * against `now()` inside the statement, so two API instances with drifting
 * clocks still agree; and rotation and revocation are single conditional
 * updates, so concurrent attempts on the same token produce exactly one
 * winner without an advisory lock.
 */
export class Sessions extends TableModel {
  static schema = sessionsSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, sessionsSchema, logger);
  }

  /**
   * Insert one session.
   * @param {object} session
   * @param {string} session.portalUserId Owning portal user.
   * @param {string} session.tokenHash HMAC of the issued token.
   * @param {number} session.idleMinutes Idle timeout in minutes.
   * @param {number} session.absoluteHours Absolute lifetime in hours.
   * @param {{tx?: import('pg-promise').IDatabase<unknown>}} [options]
   * @returns {Promise<object>} Safe session view.
   */
  async insertSession(
    { portalUserId, tokenHash, idleMinutes, absoluteHours },
    { tx } = {}
  ) {
    return (tx ?? this.db).one(
      `INSERT INTO ${table(this)} AS s
         (portal_user_id,token_hash,idle_expires_at,absolute_expires_at,created_by,updated_by)
       VALUES ($1,$2,
               now() + ($3::integer * interval '1 minute'),
               now() + ($4::integer * interval '1 hour'),
               $1,$1)
       RETURNING ${viewColumns}`,
      [portalUserId, tokenHash, idleMinutes, absoluteHours]
    );
  }

  /**
   * Lock and list a user's live sessions, oldest first, for the session cap.
   *
   * Liveness here is the same test resolution applies: unarchived and past
   * neither limit. Counting an idle-expired session would let the cap evict
   * the oldest session by `created_at` — which can be the one actually in use
   * — to make room the user did not need, and would record a `session_cap`
   * revocation for a session that could no longer authenticate.
   *
   * `FOR UPDATE` is what makes the cap hold: two logins racing for the
   * eleventh slot serialize here, so the second sees the first one's row.
   * @param {string} portalUserId
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<{id: string, tenant_id: string|null}[]>}
   */
  async lockLiveForUser(portalUserId, { tx }) {
    return tx.any(
      `SELECT id,tenant_id FROM ${table(this)}
        WHERE portal_user_id=$1 AND deactivated_at IS NULL
          AND idle_expires_at > now() AND absolute_expires_at > now()
        ORDER BY created_at,id
          FOR UPDATE`,
      [portalUserId]
    );
  }

  /**
   * Find an unarchived session by token hash, with the account eligibility
   * and staleness flags resolution needs.
   * @param {string} tokenHash
   * @param {number} touchMinutes Minutes after which `last_seen_at` may be refreshed.
   * @param {{tx?: import('pg-promise').IDatabase<unknown>}} [options]
   * @returns {Promise<object|null>} Safe session view plus `user_status`, `must_change_password`, `user_archived`, `expired`, `stale`, and `access_expired`.
   */
  async findByTokenHash(tokenHash, touchMinutes, { tx } = {}) {
    return (tx ?? this.db).oneOrNone(
      `SELECT ${viewColumns},
              u.status AS user_status,
              u.must_change_password,
              (u.deactivated_at IS NOT NULL) AS user_archived,
              (s.idle_expires_at <= now() OR s.absolute_expires_at <= now()) AS expired,
              (s.last_seen_at <= now() - ($2::integer * interval '1 minute')) AS stale,
              (s.access_mode='support' AND s.access_expires_at <= now()) AS access_expired
         FROM ${table(this)} AS s
         JOIN ${this.schemaName}.portal_users AS u ON u.id = s.portal_user_id
        WHERE s.token_hash=$1 AND s.deactivated_at IS NULL`,
      [tokenHash, touchMinutes]
    );
  }

  /**
   * Refresh `last_seen_at` and extend idle expiry, never past absolute expiry.
   * @param {string} id
   * @param {number} idleMinutes
   * @param {number} touchMinutes Minimum age of `last_seen_at` before it is rewritten.
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<{last_seen_at: Date, idle_expires_at: Date}|null>} `null` when another request already refreshed it.
   */
  async touch(id, idleMinutes, touchMinutes, { tx }) {
    return tx.oneOrNone(
      `UPDATE ${table(this)} AS s
          SET last_seen_at=now(),
              idle_expires_at=LEAST(now() + ($2::integer * interval '1 minute'),s.absolute_expires_at)
        WHERE s.id=$1 AND s.deactivated_at IS NULL
          AND s.idle_expires_at > now() AND s.absolute_expires_at > now()
          AND s.last_seen_at <= now() - ($3::integer * interval '1 minute')
        RETURNING s.last_seen_at,s.idle_expires_at`,
      [id, idleMinutes, touchMinutes]
    );
  }

  /**
   * Replace a live session's token, matching on the current hash.
   *
   * The `token_hash=$1` predicate is the whole concurrency contract: the
   * second of two concurrent rotations blocks on the row lock, re-reads the
   * committed row, no longer matches, and updates nothing.
   * @param {string} currentHash
   * @param {string} nextHash
   * @param {number} idleMinutes
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object|null>} Safe session view, or `null` when the token was already replaced, expired, or revoked.
   */
  async rotate(currentHash, nextHash, idleMinutes, { tx }) {
    return tx.oneOrNone(
      `UPDATE ${table(this)} AS s
          SET token_hash=$2,
              last_seen_at=now(),
              idle_expires_at=LEAST(now() + ($3::integer * interval '1 minute'),s.absolute_expires_at)
        WHERE s.token_hash=$1 AND s.deactivated_at IS NULL
          AND s.idle_expires_at > now() AND s.absolute_expires_at > now()
        RETURNING ${viewColumns}`,
      [currentHash, nextHash, idleMinutes]
    );
  }

  /**
   * Select a tenant for normal work, replacing the token in the same
   * statement as `rotate`. Requires the session to currently be a normal
   * (non-support) session — M0001-09's lifecycle rule that a support session
   * must exit before selecting again.
   * @param {string} currentHash
   * @param {string} nextHash
   * @param {string} tenantId
   * @param {number} idleMinutes
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object|null>} Safe session view, or `null` when the
   *   token was already replaced/expired/revoked, or the session was not
   *   in normal mode.
   */
  async selectTenant(currentHash, nextHash, tenantId, idleMinutes, { tx }) {
    return tx.oneOrNone(
      `UPDATE ${table(this)} AS s
          SET token_hash=$2,
              tenant_id=$3,
              access_mode='normal',
              effective_user_id=NULL,
              access_reason=NULL,
              access_expires_at=NULL,
              last_seen_at=now(),
              idle_expires_at=LEAST(now() + ($4::integer * interval '1 minute'),s.absolute_expires_at)
        WHERE s.token_hash=$1 AND s.deactivated_at IS NULL AND s.access_mode='normal'
          AND s.idle_expires_at > now() AND s.absolute_expires_at > now()
        RETURNING ${viewColumns}`,
      [currentHash, nextHash, tenantId, idleMinutes]
    );
  }

  /**
   * Enter a time-limited support context, replacing the token in the same
   * statement. Requires the session to currently be a normal session.
   * `access_expires_at` never exceeds the session's own absolute expiry.
   * @param {string} currentHash
   * @param {string} nextHash
   * @param {object} support
   * @param {string} support.tenantId
   * @param {string|null} support.effectiveUserId
   * @param {string} support.reason
   * @param {number} idleMinutes
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object|null>} Safe session view, or `null` when the
   *   token was already replaced/expired/revoked, or the session was not
   *   in normal mode.
   */
  async enterSupport(
    currentHash,
    nextHash,
    { tenantId, effectiveUserId, reason },
    idleMinutes,
    { tx }
  ) {
    return tx.oneOrNone(
      `UPDATE ${table(this)} AS s
          SET token_hash=$2,
              tenant_id=$3,
              access_mode='support',
              effective_user_id=$4,
              access_reason=$5,
              access_expires_at=LEAST(now() + interval '60 minutes',s.absolute_expires_at),
              last_seen_at=now(),
              idle_expires_at=LEAST(now() + ($6::integer * interval '1 minute'),s.absolute_expires_at)
        WHERE s.token_hash=$1 AND s.deactivated_at IS NULL AND s.access_mode='normal'
          AND s.idle_expires_at > now() AND s.absolute_expires_at > now()
        RETURNING ${viewColumns}`,
      [currentHash, nextHash, tenantId, effectiveUserId, reason, idleMinutes]
    );
  }

  /**
   * Exit a support context, replacing the token in the same statement.
   * Requires the session to currently be a support session.
   * @param {string} currentHash
   * @param {string} nextHash
   * @param {number} idleMinutes
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object|null>} Safe session view, or `null` when the
   *   token was already replaced/expired/revoked, or the session was not
   *   in support mode.
   */
  async exitSupport(currentHash, nextHash, idleMinutes, { tx }) {
    return tx.oneOrNone(
      `UPDATE ${table(this)} AS s
          SET token_hash=$2,
              tenant_id=NULL,
              access_mode='normal',
              effective_user_id=NULL,
              access_reason=NULL,
              access_expires_at=NULL,
              last_seen_at=now(),
              idle_expires_at=LEAST(now() + ($3::integer * interval '1 minute'),s.absolute_expires_at)
        WHERE s.token_hash=$1 AND s.deactivated_at IS NULL AND s.access_mode='support'
          AND s.idle_expires_at > now() AND s.absolute_expires_at > now()
        RETURNING ${viewColumns}`,
      [currentHash, nextHash, idleMinutes]
    );
  }

  /**
   * Downgrade a support session whose access window has passed, replacing
   * the token in the same statement. Keyed by `id` rather than the
   * presented token's hash: `resolveSession` calls this from a passive read
   * path, where the caller only knows the session's *current* (still valid)
   * token, not a hash that predicts a winner under concurrent requests. Two
   * concurrent callers for the same session serialize on the row; the
   * loser's `access_mode='support'` precondition no longer matches once the
   * winner commits, so it returns `null` rather than a second, conflicting
   * rotation.
   * @param {string} id
   * @param {string} nextHash
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<object|null>} Safe session view, or `null` when
   *   another request already won the race, or the session no longer
   *   qualifies.
   */
  async downgradeExpiredAccess(id, nextHash, { tx }) {
    return tx.oneOrNone(
      `UPDATE ${table(this)} AS s
          SET token_hash=$2,
              tenant_id=NULL,
              access_mode='normal',
              effective_user_id=NULL,
              access_reason=NULL,
              access_expires_at=NULL
        WHERE s.id=$1 AND s.deactivated_at IS NULL AND s.access_mode='support'
          AND s.access_expires_at <= now()
        RETURNING ${viewColumns}`,
      [id, nextHash]
    );
  }

  /**
   * Read a live session's current safe view by identifier.
   *
   * Used by `resolveSession` when it loses a race to downgrade an
   * expired-access support session to another concurrent request: that
   * request's rotation already committed, so this reads the result by `id`
   * rather than by a token hash that no longer matches anything.
   * @param {string} id
   * @param {{tx?: import('pg-promise').IDatabase<unknown>}} [options]
   * @returns {Promise<object|null>} Safe session view, or `null` if archived or missing.
   */
  async findById(id, { tx } = {}) {
    return (tx ?? this.db).oneOrNone(
      `SELECT ${viewColumns} FROM ${table(this)} AS s
        WHERE s.id=$1 AND s.deactivated_at IS NULL`,
      [id]
    );
  }

  /**
   * Archive one session by identifier.
   * @param {string} id
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<{id: string, portal_user_id: string, tenant_id: string|null}|null>} `null` when it was already archived.
   */
  async archiveById(id, { tx }) {
    return tx.oneOrNone(
      `UPDATE ${table(this)} AS s SET deactivated_at=now()
        WHERE s.id=$1 AND s.deactivated_at IS NULL
        RETURNING s.id,s.portal_user_id,s.tenant_id`,
      [id]
    );
  }

  /**
   * Archive one session by token hash, expired or not.
   * @param {string} tokenHash
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<{id: string, portal_user_id: string, tenant_id: string|null}|null>}
   */
  async archiveByTokenHash(tokenHash, { tx }) {
    return tx.oneOrNone(
      `UPDATE ${table(this)} AS s SET deactivated_at=now()
        WHERE s.token_hash=$1 AND s.deactivated_at IS NULL
        RETURNING s.id,s.portal_user_id,s.tenant_id`,
      [tokenHash]
    );
  }

  /**
   * Archive every live session for a user, optionally sparing one.
   * @param {string} portalUserId
   * @param {string|null} exceptId Session to keep, or `null` for all.
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<{id: string, tenant_id: string|null}[]>} The sessions this call archived.
   */
  async archiveForUser(portalUserId, exceptId, { tx }) {
    return tx.any(
      `UPDATE ${table(this)} AS s SET deactivated_at=now()
        WHERE s.portal_user_id=$1 AND s.deactivated_at IS NULL
          AND ($2::uuid IS NULL OR s.id <> $2::uuid)
        RETURNING s.id,s.tenant_id`,
      [portalUserId, exceptId]
    );
  }

  /**
   * Archive every live session a portal user holds for one tenant.
   *
   * The membership-scoped sibling of `archiveForUser`: a suspended or
   * archived membership must revoke only the sessions that selected its
   * tenant, leaving any session the user holds in a different tenant alone.
   * @param {string} portalUserId
   * @param {string} tenantId
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<{id: string, tenant_id: string|null}[]>} The sessions this call archived.
   */
  async archiveForUserAndTenant(portalUserId, tenantId, { tx }) {
    return tx.any(
      `UPDATE ${table(this)} AS s SET deactivated_at=now()
        WHERE s.portal_user_id=$1 AND s.tenant_id=$2 AND s.deactivated_at IS NULL
        RETURNING s.id,s.tenant_id`,
      [portalUserId, tenantId]
    );
  }

  /**
   * Read a session's ownership and tenant by identifier, archived or not.
   *
   * Revocation authority is decided from this row before anything else is
   * read or written, so a caller denied the session's tenant learns nothing
   * beyond the refusal.
   * @param {string} id
   * @param {{tx?: import('pg-promise').IDatabase<unknown>}} [options]
   * @returns {Promise<{id: string, portal_user_id: string, tenant_id: string|null, deactivated_at: Date|null}|null>}
   */
  async findAnyById(id, { tx } = {}) {
    return (tx ?? this.db).oneOrNone(
      `SELECT s.id,s.portal_user_id,s.tenant_id,s.deactivated_at
         FROM ${table(this)} AS s WHERE s.id=$1`,
      [id]
    );
  }
}
