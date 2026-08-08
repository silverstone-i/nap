/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';

import { createTables } from '../../../src/db/index.js';
import { authModule } from '../../../src/modules/auth/authRepositories.js';
import { ImpersonationLogs } from '../../../src/modules/auth/models/ImpersonationLogs.js';
import { PortalUsers } from '../../../src/modules/auth/models/PortalUsers.js';
import { PortalUserTenants } from '../../../src/modules/auth/models/PortalUserTenants.js';
import { Sessions } from '../../../src/modules/auth/models/Sessions.js';
import { sessionsAndIdleWindow } from '../../../src/modules/auth/schema/migrations/0002-sessions-and-idle-window.js';

describe('auth module descriptor', () => {
  it('registers as an admin-scope, non-licensable module', () => {
    expect(authModule.name).toBe('auth');
    expect(authModule.schemaScope).toBe('admin');
    expect(authModule.licensable).toBe(false);
  });

  it('declares the four auth repositories and both migrations in order', () => {
    expect(authModule.models).toEqual({
      portalUsers: PortalUsers,
      portalUserTenants: PortalUserTenants,
      impersonationLogs: ImpersonationLogs,
      sessions: Sessions,
    });
    expect(authModule.migrations).toEqual([
      createTables,
      sessionsAndIdleWindow,
    ]);
  });
});
