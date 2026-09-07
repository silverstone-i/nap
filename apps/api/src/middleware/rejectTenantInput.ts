/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { HttpError } from '../util/httpError.js';
import { fieldError } from '../util/fieldErrors.js';
import type { RequestHandler } from 'express';

const tenantNames = new Set([
  'tenant_id',
  'tenantid',
  'tenant-id',
  'x-tenant-id',
]);
const message = 'Tenant is resolved from the session';

/**
 * Does: Returns true when a key, compared without regard to case, is one of
 * the spellings a client might use to name a tenant.
 * Called by: the walkers below for every key they meet.
 */
function namesTenant(key: string) {
  return tenantNames.has(key.toLowerCase());
}

/**
 * Does: Returns the dotted path of the first key inside a value that names a
 * tenant, searching objects and arrays at any depth, or undefined.
 * Called by: rejectTenantInput for the request body.
 * Why: depth is bounded by the JSON body ceiling, so recursion is safe here.
 */
function tenantPath(value: unknown, path: string): string | undefined {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = tenantPath(item, path ? `${path}.${index}` : `${index}`);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  for (const [key, item] of Object.entries(value)) {
    const keyPath = path ? `${path}.${key}` : key;
    if (namesTenant(key)) return keyPath;
    const found = tenantPath(item, keyPath);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * Does: Passes an INVALID_INPUT error on when a request names a tenant in a
 * header, a query parameter, a route parameter, or anywhere in its body, and
 * otherwise lets the request continue.
 * Called by: the framework router, after the session gates and before input
 * validation, on every framework route.
 * Why: the active tenant comes only from the resolved session; a tenant
 * value in the request is refused rather than merged or ignored (ARCH-022,
 * ARCH-050). It runs after the gates so an unauthenticated request is still
 * answered UNAUTHENTICATED, and before validation so a loose schema cannot
 * silently drop the key. The field-error key names where the value was
 * found; the value itself is never echoed.
 */
export const rejectTenantInput: RequestHandler = (request, _response, next) => {
  const found =
    Object.keys(request.headers)
      .filter(namesTenant)
      .map(key => `headers.${key}`)[0] ??
    Object.keys(request.query)
      .filter(namesTenant)
      .map(key => `query.${key}`)[0] ??
    Object.keys(request.params)
      .filter(namesTenant)
      .map(key => `params.${key}`)[0] ??
    tenantPath(request.body, '');
  next(
    found === undefined
      ? undefined
      : new HttpError('INVALID_INPUT', fieldError(found, message))
  );
};
