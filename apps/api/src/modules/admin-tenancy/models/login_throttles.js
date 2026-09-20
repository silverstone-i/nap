/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { TableModel } from 'pg-schemata';

/**
 * Schema object for `admin.login_throttles`: keyed login-failure windows. Keys are HMAC values, never emails or addresses.
 * Kept identical to the copy frozen in migration `001-admin-tenancy`.
 */
export const loginThrottlesSchema = {
  dbSchema: 'admin',
  table: 'login_throttles',
  columns: [
    { name: 'key_hash', type: 'text', notNull: true, immutable: true },
    { name: 'failures', type: 'integer', notNull: true, default: 0 },
    { name: 'window_started_at', type: 'timestamptz', notNull: true },
    { name: 'last_failed_at', type: 'timestamptz', notNull: true },
    { name: 'locked_until', type: 'timestamptz' },
  ],
  constraints: {
    primaryKey: ['key_hash'],
    checks: ['failures >= 0'],
    indexes: [{ columns: ['locked_until'] }, { columns: ['last_failed_at'] }],
  },
};

/**
 * Qualified table name for a model instance.
 *
 * A module function rather than a private getter, for the reason given in
 * `sessions.js`: `forSchema` clones a model with `Object.create`, which does
 * not carry private fields.
 * @param {LoginThrottles} model
 * @returns {string}
 */
function table(model) {
  return `${model.schemaName}.${model.tableName}`;
}

/**
 * Whether the stored window has been spent and the next failure starts a new one.
 *
 * Two ways in. A lock that has run out always starts fresh, so a key does not
 * re-lock on the single next attempt after serving a fifteen-minute penalty.
 * An unlocked key starts fresh once its window has elapsed, which is the plain
 * reading of "five failures in fifteen minutes".
 */
const SPENT = `((l.locked_until IS NOT NULL AND l.locked_until <= now())
       OR (l.locked_until IS NULL
           AND l.window_started_at <= now() - ($3::integer * interval '1 minute')))`;

/** The failure count this attempt produces. */
const NEXT = `(CASE WHEN ${SPENT} THEN 1 ELSE l.failures + 1 END)`;

/**
 * Model for `admin.login_throttles`.
 *
 * Every method is raw SQL for the reason the `Sessions` model gives: the
 * window arithmetic must be decided by PostgreSQL against one `now()`, not by
 * an API process with its own clock. `recordFailure` in particular is a single
 * statement, which is what lets M0001-03-R003 claim atomicity — two concurrent
 * failures on one key serialize on the row, and the second reads the count the
 * first committed.
 *
 * No method takes or returns a raw email or client address. The caller hashes
 * both before they reach this model.
 */
export class LoginThrottles extends TableModel {
  static schema = loginThrottlesSchema;
  constructor(db, pgp, logger) {
    super(db, pgp, loginThrottlesSchema, logger);
  }

  /**
   * The longest live lock among a set of keys, and which key holds it.
   *
   * One statement covers both of a login's keys, so the check costs a single
   * indexed read. The latest expiry wins because a caller held by two locks
   * must wait for the longer one, and the key comes back so the refusal can be
   * attributed in an event without naming an account or an address.
   * @param {string[]} keyHashes
   * @param {{tx?: import('pg-promise').IDatabase<unknown>}} [options]
   * @returns {Promise<{key_hash: string, locked_until: Date}|null>} `null` when no key is locked.
   */
  async lockedUntil(keyHashes, { tx } = {}) {
    if (!keyHashes.length) return null;
    return (tx ?? this.db).oneOrNone(
      `SELECT key_hash,locked_until FROM ${table(this)}
        WHERE key_hash = ANY($1::text[]) AND locked_until > now()
        ORDER BY locked_until DESC,key_hash
        LIMIT 1`,
      [keyHashes]
    );
  }

  /**
   * Record one failure against a key, opening, extending, or restarting its
   * window and locking it at the limit.
   *
   * A live lock is never extended: an attacker hammering a locked key cannot
   * stretch the penalty, and neither can they shorten it.
   * @param {string} keyHash
   * @param {object} limits
   * @param {number} limits.maxFailures Failures that lock the key.
   * @param {number} limits.windowMinutes Length of one failure window.
   * @param {number} limits.lockMinutes Length of the lock.
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<{failures: number, locked_until: Date|null}>}
   */
  async recordFailure(
    keyHash,
    { maxFailures, windowMinutes, lockMinutes },
    { tx }
  ) {
    return tx.one(
      `INSERT INTO ${table(this)} AS l
         (key_hash,failures,window_started_at,last_failed_at)
       VALUES ($1,1,now(),now())
       ON CONFLICT (key_hash) DO UPDATE
          SET failures = ${NEXT},
              window_started_at = CASE WHEN ${SPENT} THEN now() ELSE l.window_started_at END,
              last_failed_at = now(),
              locked_until = CASE
                WHEN l.locked_until > now() THEN l.locked_until
                WHEN ${NEXT} >= $2::integer THEN now() + ($4::integer * interval '1 minute')
                ELSE NULL END
       RETURNING l.failures,l.locked_until`,
      [keyHash, maxFailures, windowMinutes, lockMinutes]
    );
  }

  /**
   * Forget a key's failure history.
   *
   * A successful login calls this for the account key only. The client-address
   * key survives, so one attacker who guesses one password correctly does not
   * clear the address window they built up against every other account.
   * @param {string} keyHash
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<number>} Rows removed, zero or one.
   */
  async clear(keyHash, { tx }) {
    return tx.result(
      `DELETE FROM ${table(this)} WHERE key_hash=$1`,
      [keyHash],
      result => result.rowCount
    );
  }

  /**
   * Delete spent rows older than `hours`.
   *
   * This table has no soft deletion, so rows can simply go. A live lock is
   * kept whatever its age, which matters only for a retention shorter than the
   * lock itself but costs nothing to state.
   * @param {number} hours
   * @param {{tx: import('pg-promise').IDatabase<unknown>}} options
   * @returns {Promise<number>} Rows removed.
   */
  async purgeExpired(hours, { tx }) {
    return tx.result(
      `DELETE FROM ${table(this)}
        WHERE last_failed_at < now() - ($1::integer * interval '1 hour')
          AND (locked_until IS NULL OR locked_until <= now())`,
      [hours],
      result => result.rowCount
    );
  }
}
