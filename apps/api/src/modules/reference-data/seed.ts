/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import countries from './seeds/countries.json' with { type: 'json' };
import currencies from './seeds/currencies.json' with { type: 'json' };
import type { Database } from 'pg-schemata';
/** Does: Identifies the committed reference snapshot. Used by: seeding and readiness verification. */
export const referenceVersion = '2026-09-12';
/** Does: Inserts missing reference codes and records their snapshot atomically. Called by: cell seeding and fixtures. */
export async function seedReference(db: Database) {
  await db.tx(async tx => {
    await tx.any('SELECT pg_advisory_xact_lock(736,1)');
    for (const row of countries)
      await tx.none(
        'INSERT INTO reference.countries(code,alpha3,numeric,name) VALUES($1,$2,$3,$4) ON CONFLICT(code) DO NOTHING',
        [row.code, row.alpha3, row.numeric, row.name]
      );
    for (const row of currencies)
      await tx.none(
        'INSERT INTO reference.currencies(code,numeric,name,minor_units) VALUES($1,$2,$3,$4) ON CONFLICT(code) DO NOTHING',
        [row.code, row.numeric, row.name, row.minor_units]
      );
    await tx.none(
      'INSERT INTO reference.seed_versions(version) VALUES($1) ON CONFLICT DO NOTHING',
      [referenceVersion]
    );
  });
}
/** Does: Checks the complete code set and snapshot ledger. Called by: activation and runtime readiness. */
export async function referenceReady(db: Pick<Database, 'one'>) {
  const result = await db.one<{ ready: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM reference.seed_versions WHERE version=$1)
 AND NOT EXISTS(SELECT unnest($2::text[]) EXCEPT SELECT code FROM reference.countries)
 AND NOT EXISTS(SELECT unnest($3::text[]) EXCEPT SELECT code FROM reference.currencies) AS ready`,
    [referenceVersion, countries.map(r => r.code), currencies.map(r => r.code)]
  );
  return result.ready;
}
