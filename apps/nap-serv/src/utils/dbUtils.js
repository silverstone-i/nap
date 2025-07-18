'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { db } from '../db/db.js';

export async function resolvePartyId({ tenantCode, schema, code, partyType }) {
  const table = {
    vendor: 'vendors',
    client: 'clients',
    employee: 'employees',
  }[partyType];

  if (!table) throw new Error(`Unsupported party type: ${partyType}`);

  const codeCol = `${partyType}_code`;
  const row = await db.oneOrNone(`SELECT id FROM ${schema}.${table} WHERE ${codeCol} = $1`, [code]);
  if (!row) throw new Error(`${partyType} with code ${code} not found`);

  const partyRow = await db.one(
    `INSERT INTO ${schema}.parties (tenant_code, party_id, party_type)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [tenantCode, row.id, partyType]
  );

  return partyRow.id;
}
