/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineMigration } from 'pg-schemata';

/**
 * I0007-R001: allow `requested_action = 'seed'` on
 * `admin.cell_provisioning`, so a job can load a new reference seed into an
 * existing cell. The baseline names its checks automatically, so the old
 * check is found by its definition. Do not edit after this migration has
 * been applied to a persistent environment; add a new migration instead.
 */
export const migration = defineMigration({
  id: '002-cell-seed-action',
  up: async ({ db }) => {
    const rows = await db.any(
      `SELECT conname FROM pg_constraint
        WHERE conrelid = 'admin.cell_provisioning'::regclass AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%requested_action%'`
    );
    for (const { conname } of rows)
      await db.none(
        'ALTER TABLE admin.cell_provisioning DROP CONSTRAINT $1:name',
        [conname]
      );
    await db.none(
      `ALTER TABLE admin.cell_provisioning
         ADD CONSTRAINT cell_provisioning_requested_action_check
         CHECK (requested_action IN ('provision', 'activate', 'seed'))`
    );
  },
});
