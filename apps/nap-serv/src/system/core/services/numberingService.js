/**
 * @file Numbering service — transaction-safe serial allocation for tenant entities
 * @module core/services/numberingService
 *
 * Provides allocateNumber() which must be called inside an existing transaction
 * (or will create its own). Returns { serial, periodKey, displayId } or null
 * when numbering is disabled for the given id_type.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import db, { pgp } from '../../../db/db.js';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

/**
 * Compute the period_key from a reset_mode and a reference date.
 * @param {string} resetMode  One of: never, yearly, monthly, daily
 * @param {Date}   refDate    Date used to derive the period key
 * @returns {string} Period key string
 */
export function computePeriodKey(resetMode, refDate) {
  const d = refDate instanceof Date ? refDate : new Date(refDate);
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  switch (resetMode) {
    case 'yearly':
      return y;
    case 'monthly':
      return `${y}-${m}`;
    case 'daily':
      return `${y}-${m}-${day}`;
    default:
      return 'global';
  }
}

/**
 * Build the human-readable display ID from config, serial, and period key.
 * @param {object} config  Numbering config row
 * @param {number} serial  Allocated serial number
 * @param {string} periodKey  Current period key
 * @returns {string} Formatted display ID
 */
export function buildDisplayId(config, serial, periodKey) {
  const padded = String(serial).padStart(config.padding, '0');
  const sep = config.separator || '';

  let datePart = '';
  if (config.date_mode !== 'none' && periodKey && periodKey !== 'global') {
    datePart = periodKey;
  }

  const parts = [config.prefix, datePart, padded, config.suffix].filter(Boolean);
  const result = parts.join(sep);
  return config.uppercase ? result.toUpperCase() : result;
}

/**
 * Allocate the next number for a given entity type within a tenant schema.
 *
 * @param {string}      schema    Tenant schema name (e.g. 'acme')
 * @param {string}      idType    One of: employee, vendor, client, contact, ar_invoice, ap_invoice, project
 * @param {string|null} scopeId   UUID of scope entity (e.g. legal_entity_id), or null for global
 * @param {Date}        issuedAt  Date to derive period key from
 * @param {object}      [t]       Optional pg-promise transaction context
 * @returns {Promise<{ serial: number, periodKey: string, displayId: string } | null>}
 */
export async function allocateNumber(schema, idType, scopeId = null, issuedAt = new Date(), t = null) {
  const s = pgp.as.name(schema);
  const effectiveScopeId = scopeId || NIL_UUID;

  const exec = async (tx) => {
    // 1. Read config
    const config = await tx.oneOrNone(`SELECT * FROM ${s}.tenant_numbering_config WHERE id_type = $1`, [idType]);

    if (!config || !config.is_enabled) {
      return null;
    }

    // 2. Compute period key
    const periodKey = computePeriodKey(config.reset_mode, issuedAt);

    // 3. SELECT … FOR UPDATE on sequence state row
    const state = await tx.oneOrNone(
      `SELECT id, last_serial FROM ${s}.tenant_number_sequence_state
       WHERE id_type = $1 AND scope_id = $2 AND period_key = $3
       FOR UPDATE`,
      [idType, effectiveScopeId, periodKey],
    );

    let serial;
    if (!state) {
      // 4a. Insert new row with last_serial = 1
      serial = 1;
      await tx.none(
        `INSERT INTO ${s}.tenant_number_sequence_state
         (tenant_id, id_type, scope_id, period_key, last_serial)
         VALUES ($1, $2, $3, $4, $5)`,
        [config.tenant_id, idType, effectiveScopeId, periodKey, serial],
      );
    } else {
      // 4b. Increment
      serial = Number(state.last_serial) + 1;
      await tx.none(`UPDATE ${s}.tenant_number_sequence_state SET last_serial = $1 WHERE id = $2`, [serial, state.id]);
    }

    // 5. Build display ID
    const displayId = buildDisplayId(config, serial, periodKey);

    return { serial, periodKey, displayId };
  };

  // If caller provided a transaction context, use it; otherwise create one
  if (t) {
    return exec(t);
  }
  return db.tx(exec);
}

/* ── Entity-type → table mapping ──────────────────────────────── */

const ID_TYPE_TABLE = {
  employee: 'employees',
  vendor: 'vendors',
  client: 'clients',
  contact: 'contacts',
};

/**
 * Backfill codes for existing records that have code IS NULL when numbering
 * is first enabled for an entity type.  Must be called inside a transaction.
 *
 * @param {string} schema  Tenant schema name
 * @param {string} idType  One of: employee, vendor, client, contact
 * @param {object} tx      pg-promise transaction context
 * @returns {Promise<number>} Count of records backfilled
 */
export async function backfillCodes(schema, idType, tx) {
  const table = ID_TYPE_TABLE[idType];
  if (!table) return 0;

  const s = pgp.as.name(schema);
  const rows = await tx.manyOrNone(
    `SELECT id FROM ${s}.${table}
     WHERE code IS NULL AND deactivated_at IS NULL
     ORDER BY created_at`,
  );

  for (const row of rows) {
    const numbering = await allocateNumber(schema, idType, null, new Date(), tx);
    if (numbering) {
      await tx.none(`UPDATE ${s}.${table} SET code = $1 WHERE id = $2`, [numbering.displayId, row.id]);
    }
  }

  return rows.length;
}
