/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import snapshot from './snapshot.json' with { type: 'json' };
import { MaintenanceError } from '../../../application/shared/errors.js';

/** The seed version this code requires in every cell (M0004-R004). */
export const SEED_VERSION = snapshot.version;

/**
 * Check a snapshot before any row is written (M0004-R006): codes unique and
 * well formed, minor units 0 to 4.
 * @param {{version: number, countries: object[], currencies: object[]}} data
 * @returns {void}
 * @throws {MaintenanceError} `SEED_FAILED` on the first violation.
 */
export function validateSnapshot(data) {
  const fail = () => {
    throw new MaintenanceError('SEED_FAILED');
  };
  if (!Number.isInteger(data?.version) || data.version < 1) fail();
  const unique = (rows, key) =>
    new Set(rows.map(r => r[key])).size === rows.length;
  const { countries, currencies } = data;
  if (!Array.isArray(countries) || !Array.isArray(currencies)) fail();
  for (const c of countries)
    if (
      !/^[A-Z]{2}$/.test(c.code) ||
      !/^[A-Z]{3}$/.test(c.alpha3) ||
      !/^[0-9]{3}$/.test(c.numericCode) ||
      !c.name
    )
      fail();
  for (const c of currencies)
    if (
      !/^[A-Z]{3}$/.test(c.code) ||
      !/^[0-9]{3}$/.test(c.numericCode) ||
      !c.name ||
      !Number.isInteger(c.minorUnit) ||
      c.minorUnit < 0 ||
      c.minorUnit > 4
    )
      fail();
  if (
    !['code', 'alpha3', 'numericCode'].every(k => unique(countries, k)) ||
    !['code', 'numericCode'].every(k => unique(currencies, k))
  )
    fail();
}

/**
 * Load the snapshot into one cell in a single transaction (M0004-R005):
 * upsert every row by `code` and record the version. Rerunning the same
 * version leaves the data unchanged. Rows are never deleted (M0004 §7).
 * @param {import('pg-promise').IDatabase<unknown>} db `nap-admin` connection.
 * @param {typeof snapshot} [data=snapshot]
 * @returns {Promise<void>}
 */
export async function seedReferenceData(db, data = snapshot) {
  validateSnapshot(data);
  await db.tx(async tx => {
    await tx.none(
      `INSERT INTO reference.countries (code, alpha3, numeric_code, name)
       SELECT * FROM jsonb_to_recordset($1::jsonb)
         AS r(code text, alpha3 text, "numericCode" text, name text)
       ON CONFLICT (code) DO UPDATE SET alpha3 = EXCLUDED.alpha3,
         numeric_code = EXCLUDED.numeric_code, name = EXCLUDED.name
       WHERE (reference.countries.alpha3, reference.countries.numeric_code, reference.countries.name)
         IS DISTINCT FROM (EXCLUDED.alpha3, EXCLUDED.numeric_code, EXCLUDED.name)`,
      [JSON.stringify(data.countries)]
    );
    await tx.none(
      `INSERT INTO reference.currencies (code, numeric_code, name, minor_unit)
       SELECT * FROM jsonb_to_recordset($1::jsonb)
         AS r(code text, "numericCode" text, name text, "minorUnit" smallint)
       ON CONFLICT (code) DO UPDATE SET numeric_code = EXCLUDED.numeric_code,
         name = EXCLUDED.name, minor_unit = EXCLUDED.minor_unit
       WHERE (reference.currencies.numeric_code, reference.currencies.name, reference.currencies.minor_unit)
         IS DISTINCT FROM (EXCLUDED.numeric_code, EXCLUDED.name, EXCLUDED.minor_unit)`,
      [JSON.stringify(data.currencies)]
    );
    await tx.none(
      'INSERT INTO reference.seed_versions (version) VALUES ($1) ON CONFLICT DO NOTHING',
      [data.version]
    );
  });
}

/**
 * Whether the cell holds the required seed version (M0004-R007). A cell
 * migrated before this module existed has no `reference.seed_versions`
 * table; that counts as not seeded. Other errors propagate.
 * @param {import('pg-promise').IDatabase<unknown>} db Any role that can read `reference`.
 * @param {number} [version=SEED_VERSION]
 * @returns {Promise<boolean>}
 */
export async function seedPresent(db, version = SEED_VERSION) {
  try {
    const row = await db.oneOrNone(
      'SELECT 1 FROM reference.seed_versions WHERE version = $1',
      [version]
    );
    return row !== null;
  } catch (error) {
    // 42P01 undefined_table; 3F000 invalid_schema_name.
    if (error?.code === '42P01' || error?.code === '3F000') return false;
    throw error;
  }
}
