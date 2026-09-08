/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { SessionView } from '@nap/shared';
import { z } from 'zod';
import { HttpError } from '../util/httpError.js';
import type { RequestHandler } from 'express';

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
  readonly sessionId?: string;
  readonly view?: SessionView;
  readonly tenantId?: string;
  readonly entitlements: ReadonlySet<string>;
  readonly permissions: ReadonlySet<string>;
};

const tenantUuid = z.uuid();

/**
 * Does: Lets the request continue only when a resolved session is stored on
 * the response, and otherwise passes an UNAUTHENTICATED error on.
 * Called by: the framework router, first gate on every framework route.
 * Why: only database-verified sessions pass this gate (AUTH-003).
 */
export const requireSession: RequestHandler = (_request, response, next) => {
  next(response.locals.session ? undefined : new HttpError('UNAUTHENTICATED'));
};

/**
 * Does: Lets the request continue only when the resolved session names an
 * active tenant as a UUID, and otherwise passes a FORBIDDEN error on.
 * Called by: the framework router, after requireSession, on every route.
 * Why: a cell-targeted route opens a tenant transaction and must have exactly
 * one active tenant before tenant-owned work begins (ARCH-022).
 */
export const requireTenant: RequestHandler = (_request, response, next) => {
  const tenantId = response.locals.session?.tenantId;
  next(
    tenantUuid.safeParse(tenantId).success
      ? undefined
      : new HttpError('FORBIDDEN')
  );
};

/**
 * Does: Builds a gate that lets the request continue only when the active
 * tenant is entitled to the given module, and otherwise passes FORBIDDEN on.
 * Called by: the framework router when it registers each route.
 */
export function requireEntitlement(module: string): RequestHandler {
  return (_request, response, next) => {
    next(
      response.locals.session?.entitlements.has(module)
        ? undefined
        : new HttpError('FORBIDDEN')
    );
  };
}

/**
 * Does: Builds a gate that lets the request continue only when the caller
 * holds the given permission, and otherwise passes FORBIDDEN on.
 * Called by: the framework router when it registers each route, with the
 * route's module::router::action permission.
 * Why: a missing permission and a missing entitlement answer alike, so the
 * caller learns no more than ARCH-043 allows.
 */
export function requirePermission(permission: string): RequestHandler {
  return (_request, response, next) => {
    next(
      response.locals.session?.permissions.has(permission)
        ? undefined
        : new HttpError('FORBIDDEN')
    );
  };
}
