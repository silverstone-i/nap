/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { SessionView } from '@nap/shared';

/**
 * Does: Represents what the server has resolved about the caller of one
 * request: who they are, which tenant is active, which modules that tenant
 * may use, and which permissions the caller holds in it.
 * Used by: the session gates below, the framework router, and the session
 * resolver the authentication capability installs.
 * Why: every value here is resolved server-side from the database (ARCH-022);
 * nothing is taken from the request. The access-control capability may
 * extend this shape; permissions are written module::router::action.
 */
export type ResolvedSession = {
  readonly actorId: string;
  readonly operatorId?: string;
  readonly entityId?: string;
  readonly userType?: string;
  readonly platformPermissions?: ReadonlySet<string>;
  readonly sessionId?: string;
  readonly view?: SessionView;
  readonly tenantId?: string;
  readonly entitlements: ReadonlySet<string>;
  readonly permissions: ReadonlySet<string>;
};
