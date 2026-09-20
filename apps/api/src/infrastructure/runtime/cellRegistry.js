/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createDb } from 'pg-schemata';
import { repositories } from '../../modules/access-control/repositories.js';

export class CellRegistryError extends Error {
  constructor(code = 'SERVICE_UNAVAILABLE') {
    super(code);
    this.code = code;
  }
}

export function createCellDatabase(connection) {
  return createDb({
    connectionString: connection,
    repositories,
    logger: null,
    auditActorResolver: () => null,
    pool: { max: 4, connectionTimeoutMillis: 5000 },
  });
}

export function createCellRegistry(
  entries = {},
  factory = createCellDatabase,
  admin = null
) {
  const cells = new Map(
    Object.entries(entries).map(([id, connection]) => [
      id,
      { handle: factory(connection), ready: false },
    ])
  );
  return {
    async connect() {
      await Promise.all(
        [...cells.entries()].map(async ([id, cell]) => {
          try {
            if (admin) {
              const registered = await admin.db.cells.findOneBy(
                { id, enabled: true },
                { columnWhitelist: ['id'] }
              );
              if (!registered) return;
            }
            await cell.handle.connect();
            const readiness = await cell.handle.db.one(
              "SELECT 1 AS ready,to_regclass('app.roles')::text AS roles"
            );
            if (readiness.roles !== 'app.roles') return;
            cell.ready = true;
          } catch {
            cell.ready = false;
          }
        })
      );
    },
    get(id) {
      const cell = cells.get(id);
      if (!cell?.ready) throw new CellRegistryError();
      return cell.handle;
    },
    status(id) {
      return cells.get(id)?.ready === true;
    },
    async close() {
      await Promise.all([...cells.values()].map(cell => cell.handle.close()));
    },
  };
}
