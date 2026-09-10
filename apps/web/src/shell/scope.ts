/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { createContext, useContext } from 'react';
import { z } from 'zod';
/**
 * Does: Reads only implemented route state and validates identifier syntax.
 * Called by: the shared shell before any page request.
 */
export function readScope(pathname: string, search: string) {
  const parts = pathname.split('/');
  const query = new URLSearchParams(search);
  const uuid = z.uuid();
  const record = query.get('record');
  const target =
    parts[1] === 'management'
      ? parts[3] && parts[3] !== 'new'
        ? parts[3]
        : query.get('target')
      : null;
  const tenant = parts[1] === 'app' ? parts[2] : null;
  return {
    tenant: tenant && uuid.safeParse(tenant).success ? tenant : null,
    invalidTenant: parts[1] === 'app' && !uuid.safeParse(tenant).success,
    central: parts[1] === 'management',
    directory: parts[3] === 'accounting',
    tab: 'employees' as const,
    record: record && uuid.safeParse(record).success ? record : undefined,
    invalidRecord: !!record && !uuid.safeParse(record).success,
    target: target && uuid.safeParse(target).success ? target : undefined,
    invalidTarget: !!target && !uuid.safeParse(target).success,
    page: /^\d+$/.test(query.get('page') ?? '')
      ? Math.min(Number(query.get('page')), 100000)
      : 0,
    create: parts[3] === 'new',
    portalUsers: parts[2] === 'portal-users',
  };
}
/**
 * Does: Carries the shell's normalized route state and navigation eligibility.
 * Used by: routed product pages.
 */
export const ShellContext = createContext<
  (ReturnType<typeof readScope> & { employees: boolean }) | null
>(null);
/**
 * Does: Reads normalized route state from the enclosing shell.
 * Called by: product pages during render.
 */
export function useShell() {
  const scope = useContext(ShellContext);
  if (!scope) throw new Error('Product page requires the shell');
  return scope;
}
