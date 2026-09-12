/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { z } from 'zod';
import {
  authSuccessSchema,
  controlCommandResponseSchema,
  controlBodySchema,
  controlResponseSchema,
  membershipsResponseSchema,
  auditResponseSchema,
  accessBodySchema,
} from '@nap/shared';
import { requestContract } from './request.js';

/** Does: Reads authorized control records. Called by: the operator page. */
export function overview() {
  return requestContract(
    '/api/admin-tenancy/v1/control/overview',
    controlResponseSchema
  );
}
/**
 * Does: Sends an operator command and retains its saved job ID through the first synchronization attempt.
 * Called by: operator forms when submitted.
 * Why: a failed follow-up must be retried with the same job rather than creating another membership (TEN-010).
 */
export async function command(body: z.infer<typeof controlBodySchema>) {
  const action =
    body.operation === 'grant'
      ? 'grants'
      : ['member', 'revoke'].includes(body.operation)
        ? 'members'
        : ['retry', 'activate', 'reconcile'].includes(body.operation)
          ? 'provision'
          : 'registry';
  const result = await requestContract(
    '/api/admin-tenancy/v1/control/' + action,
    controlCommandResponseSchema,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (result.ok && result.body.data.jobId && body.operation === 'member') {
    const synchronization = await requestContract(
      '/api/admin-tenancy/v1/control/provision',
      controlCommandResponseSchema,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'retry',
          job: result.body.data.jobId,
          name: body.name,
        }),
      }
    );
    return { ...synchronization, jobId: result.body.data.jobId };
  }
  return {
    ...result,
    jobId: result.ok
      ? result.body.data.jobId
      : body.operation === 'retry'
        ? body.job
        : null,
  };
}
/** Does: Reads customer-visible memberships. Called by: tenant picker. */
export function getMemberships() {
  return requestContract(
    '/api/admin-tenancy/v1/auth/memberships',
    membershipsResponseSchema
  );
}
/** Does: Selects one membership. Called by: tenant picker. */
export function selectMembership(membership: string) {
  return requestContract(
    '/api/admin-tenancy/v1/auth/select',
    authSuccessSchema,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ membership }),
    }
  );
}
/** Does: Starts explicitly scoped operator access. Called by: the controlled access form. */
export function access(body: z.infer<typeof accessBodySchema>) {
  return requestContract(
    '/api/admin-tenancy/v1/auth/access',
    authSuccessSchema,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}
/** Does: Ends controlled access. Called by: the persistent banner. */
export function exitAccess() {
  return requestContract(
    '/api/admin-tenancy/v1/auth/end-access',
    authSuccessSchema,
    { method: 'POST' }
  );
}
/** Does: Reads immutable managed events. Called by: operator audit review. */
export function getAudit() {
  return requestContract(
    '/api/admin-tenancy/v1/control/audit',
    auditResponseSchema
  );
}
