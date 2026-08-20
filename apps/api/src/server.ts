/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createApp } from './app.js';
import { assertRuntimeRole } from './db/assertRuntimeRole.js';
import { createAdminDb } from './db/admin/createAdminDb.js';
import { ADMIN_SCHEMA } from './db/admin/moduleRegistry.js';
import { createCellDb } from './db/cell/createCellDb.js';
import { CELL_SCHEMAS } from './db/cell/moduleRegistry.js';
import { loadDotEnv } from './util/env.js';

loadDotEnv();

const port = Number(process.env.PORT ?? 3000);

// One central handle and one cell handle, each owning its own pool and
// lifecycle (ARCH-024). A deployment gets credentials for the control plane
// and its own cell only (ARCH-009).
const adminDb = createAdminDb();
const cellDb = createCellDb();

// Readiness only. Startup never applies migrations (ARCH-025), and it refuses
// to serve traffic on a connection that could bypass or disable RLS
// (ARCH-019).
await adminDb.connect();
await assertRuntimeRole(adminDb, { schemas: [ADMIN_SCHEMA] });

await cellDb.connect();
await assertRuntimeRole(cellDb, { schemas: CELL_SCHEMAS });

const server = createApp().listen(port, () => {
  console.log(`nap api listening on http://localhost:${port}`);
});

/**
 * Closes the listener and both handles. Each handle is closed on its own;
 * `pgp.end()` would tear down every pool in the process.
 *
 * @param signal - The signal that triggered shutdown.
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`nap api shutting down on ${signal}`);
  server.close();
  await Promise.allSettled([adminDb.close(), cellDb.close()]);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void shutdown(signal);
  });
}
