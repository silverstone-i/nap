/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// createTables comes from the file, not the db barrel: the barrel re-exports
// the registry, which imports this file — a barrel import here would cycle.
import { createTables } from '../../db/createTablesMigration.js';
import type { NapModule } from '../../db/index.js';
import { ImpersonationLogs } from './models/ImpersonationLogs.js';
import { PortalUsers } from './models/PortalUsers.js';
import { PortalUserTenants } from './models/PortalUserTenants.js';
import { Sessions } from './models/Sessions.js';
import { sessionsAndIdleWindow } from './schema/migrations/0002-sessions-and-idle-window.js';

declare module 'pg-schemata' {
  interface Repositories {
    portalUsers: PortalUsers;
    portalUserTenants: PortalUserTenants;
    impersonationLogs: ImpersonationLogs;
    sessions: Sessions;
  }
}

/** Registry descriptor for the auth module (ADR-0001, ADR-0004, ADR-0005). */
export const authModule: NapModule = {
  name: 'auth',
  schemaScope: 'admin',
  licensable: false,
  models: {
    portalUsers: PortalUsers,
    portalUserTenants: PortalUserTenants,
    impersonationLogs: ImpersonationLogs,
    sessions: Sessions,
  },
  migrations: [createTables, sessionsAndIdleWindow],
};
