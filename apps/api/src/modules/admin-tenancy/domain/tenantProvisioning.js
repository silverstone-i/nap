/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AdminControlError, withControlErrors } from './errors.js';
import { createFirstAdministrator } from './accounts.js';
import { COLLECTION_ENTITY } from './cache.js';

/** Stages a tenant provisioning job passes through, in order (I0006 §8). */
export const TENANT_STAGES = Object.freeze([
  'assignment',
  'seed',
  'activation',
  'complete',
]);

/**
 * Safe projection of `admin.tenant_provisioning`. No column is secret; the
 * temporary password is never stored on the job (I0006 §9).
 * @param {object} row
 * @returns {{tenantId: string, cellId: string, stage: string, status: string, attempts: number, failureCode: string|null}}
 */
export function tenantJobView(row) {
  return {
    tenantId: row.tenant_id,
    cellId: row.cell_id,
    stage: row.stage,
    status: row.status,
    attempts: row.attempts,
    failureCode: row.failure_code ?? null,
  };
}

const authoritySchema = z.strictObject({
  actorId: z.uuid(),
  granted: z.boolean(),
});

/**
 * @param {unknown} authority Result of `buildControlAuthority` (domain/cells.js).
 * @returns {{actorId: string, granted: boolean}}
 * @throws {AdminControlError} `INVALID_INPUT`, `FORBIDDEN`
 */
function requireGranted(authority) {
  const result = authoritySchema.safeParse(authority);
  if (!result.success) throw new AdminControlError('INVALID_INPUT');
  if (!result.data.granted) throw new AdminControlError('FORBIDDEN');
  return result.data;
}

/**
 * Append one tenant provisioning event, generating its deduplication key
 * unless the event carries the client's `Idempotency-Key`.
 * @param {object} db
 * @param {object} event
 * @param {object} tx
 * @returns {Promise<void>}
 */
async function appendTenantEvent(db, event, tx) {
  await db.managed_events.append(
    { deduplication_key: randomUUID(), target_type: 'tenant', ...event },
    { tx }
  );
}

/**
 * Advance the tenant's entity and list cache revisions.
 * @param {object} db
 * @param {string} tenantId
 * @param {object} tx
 * @returns {Promise<void>}
 */
async function advanceTenantCache(db, tenantId, tx) {
  await db.cache_revisions.advance(
    [
      { domain: 'tenant', entity: tenantId },
      { domain: 'tenant', entity: COLLECTION_ENTITY },
    ],
    { tx }
  );
}

const idempotencyKeySchema = z.uuid();

/**
 * Resolve an earlier `tenant-provision` success recorded under this key
 * (I0006-R003). The password is never stored, so it is not compared.
 * @param {object} db
 * @param {string} key
 * @param {{tenant: string, cell: string, email: string}} request
 * @returns {Promise<object|null>} The tenant's job view, or null.
 * @throws {AdminControlError} `IDEMPOTENCY_CONFLICT`
 */
async function resolveReplay(db, key, request) {
  const existing = await db.managed_events.findOneBy({
    deduplication_key: key,
    event_key: 'tenant.provision.requested',
    outcome: 'succeeded',
  });
  if (!existing) return null;
  const details = existing.details ?? {};
  if (
    existing.target_id !== request.tenant ||
    details.cell_id !== request.cell ||
    details.email !== request.email
  )
    throw new AdminControlError('IDEMPOTENCY_CONFLICT');
  const job = await db.tenant_provisioning.findOneBy({
    tenant_id: request.tenant,
  });
  return job ? tenantJobView(job) : null;
}

/**
 * Queue a customer tenant's provisioning job and create its first
 * administrator's login and membership (I0006-R001–R003).
 * @param {object} db Admin repository handle.
 * @param {unknown} authority
 * @param {{tenant: string, cell: string, admin: {email: string, password: string}}} command Validated command.
 * @param {unknown} idempotencyKeyHeader
 * @param {{requestId?: string|null, runtime?: {readiness: (id: string) => {ready: boolean}}, hashingPolicy?: unknown}} [context]
 * @returns {Promise<object>} Job view.
 * @throws {AdminControlError} `INVALID_INPUT`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE`, `CELL_UNAVAILABLE`, `CONFLICT`, `IDEMPOTENCY_CONFLICT`, `INTERNAL_ERROR`
 */
export async function provisionTenant(
  db,
  authority,
  command,
  idempotencyKeyHeader,
  { requestId = null, runtime, hashingPolicy } = {}
) {
  const granted = requireGranted(authority);
  const key = idempotencyKeySchema.safeParse(idempotencyKeyHeader);
  if (!key.success) throw new AdminControlError('INVALID_INPUT');
  const email =
    typeof command.admin.email === 'string'
      ? command.admin.email.trim().toLowerCase()
      : '';
  const request = { tenant: command.tenant, cell: command.cell, email };
  return withControlErrors(async () => {
    const replay = await resolveReplay(db, key.data, request);
    if (replay) return replay;
    return db.tx(async tx => {
      const tenant = await db.tenants.lockById(command.tenant, { tx });
      if (!tenant) throw new AdminControlError('NOT_FOUND');
      const raced = await resolveReplay(db, key.data, request);
      if (raced) return raced;
      const job = await db.tenant_provisioning.lockByTenantId(tenant.id, {
        tx,
      });
      if (
        tenant.is_napsoft ||
        tenant.status !== 'pending' ||
        tenant.cell_id ||
        job
      )
        throw new AdminControlError('INVALID_STATE');
      const cell = await db.cells.findOneBy(
        { id: command.cell },
        { columnWhitelist: ['id', 'enabled'] }
      );
      if (!cell?.enabled || !runtime?.readiness(cell.id)?.ready)
        throw new AdminControlError('CELL_UNAVAILABLE');

      const { membership } = await createFirstAdministrator(
        db,
        {
          tenantId: tenant.id,
          email: command.admin.email,
          password: command.admin.password,
          hashingPolicy,
        },
        { tx }
      );
      const created = await db.tenant_provisioning.insert(
        {
          tenant_id: tenant.id,
          cell_id: cell.id,
          admin_membership_id: membership.id,
          created_by: granted.actorId,
        },
        { tx }
      );
      await appendTenantEvent(
        db,
        {
          deduplication_key: key.data,
          event_key: 'tenant.provision.requested',
          outcome: 'succeeded',
          request_id: requestId,
          actor_id: granted.actorId,
          tenant_id: tenant.id,
          target_id: tenant.id,
          details: { cell_id: cell.id, email },
        },
        tx
      );
      await advanceTenantCache(db, tenant.id, tx);
      return tenantJobView(created);
    });
  });
}

/**
 * Return a failed tenant job to `queued` at the stage that failed
 * (I0006-R004).
 * @param {object} db
 * @param {unknown} authority
 * @param {string} tenantId
 * @param {{requestId?: string|null}} [context]
 * @returns {Promise<object>} Job view.
 * @throws {AdminControlError} `INVALID_INPUT`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE`, `INTERNAL_ERROR`
 */
export async function retryTenantProvisioning(
  db,
  authority,
  tenantId,
  { requestId = null } = {}
) {
  const granted = requireGranted(authority);
  return withControlErrors(() =>
    db.tx(async tx => {
      const job = await db.tenant_provisioning.lockByTenantId(tenantId, {
        tx,
      });
      if (!job) throw new AdminControlError('NOT_FOUND');
      if (job.status !== 'failed') throw new AdminControlError('INVALID_STATE');
      const updated = await db.tenant_provisioning.update(
        job.id,
        {
          status: 'queued',
          attempts: job.attempts + 1,
          failure_code: null,
          started_at: null,
        },
        { tx }
      );
      await appendTenantEvent(
        db,
        {
          event_key: 'tenant.provision.retry.requested',
          outcome: 'succeeded',
          request_id: requestId,
          actor_id: granted.actorId,
          tenant_id: tenantId,
          target_id: tenantId,
          details: { stage: job.stage, attempt: updated.attempts },
        },
        tx
      );
      await advanceTenantCache(db, tenantId, tx);
      return tenantJobView(updated);
    })
  );
}

/**
 * Claim the next queued tenant job for the in-process worker and move it to
 * `running` at its current stage (I0006-R005).
 * @param {object} db
 * @returns {Promise<object|null>} The job row, or null when none is queued.
 */
export async function claimTenantProvisioning(db) {
  return withControlErrors(() =>
    db.tx(async tx => {
      const job = await db.tenant_provisioning.lockNextQueued({ tx });
      if (!job) return null;
      return db.tenant_provisioning.update(
        job.id,
        { status: 'running', started_at: new Date() },
        { tx }
      );
    })
  );
}

const transitionSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('advanced'),
    stage: z.enum(['seed', 'activation']),
  }),
  z.strictObject({
    kind: z.literal('failed'),
    failureCode: z.string().min(1).max(64),
  }),
  z.strictObject({ kind: z.literal('completed') }),
  z.strictObject({ kind: z.literal('requeued') }),
]);

/**
 * Record a trusted progress update from the worker. Never reachable over
 * HTTP.
 * @param {object} db
 * @param {string} tenantId
 * @param {unknown} transition
 * @param {{onCompleted?: (tx: object, job: object) => Promise<void>}} [hooks]
 *   `onCompleted` runs inside the transaction that completes the job
 *   (I0006-R008).
 * @returns {Promise<object>} The updated row.
 * @throws {AdminControlError} `INVALID_INPUT`, `NOT_FOUND`, `INVALID_STATE`, `INTERNAL_ERROR`
 */
export async function advanceTenantProvisioning(
  db,
  tenantId,
  transition,
  { onCompleted } = {}
) {
  const result = transitionSchema.safeParse(transition);
  if (!result.success) throw new AdminControlError('INVALID_INPUT');
  const parsed = result.data;
  return withControlErrors(() =>
    db.tx(async tx => {
      const job = await db.tenant_provisioning.lockByTenantId(tenantId, {
        tx,
      });
      if (!job) throw new AdminControlError('NOT_FOUND');
      if (job.status !== 'running')
        throw new AdminControlError('INVALID_STATE');

      if (parsed.kind === 'requeued')
        return db.tenant_provisioning.update(
          job.id,
          { status: 'queued' },
          { tx }
        );

      if (parsed.kind === 'advanced') {
        const next = TENANT_STAGES[TENANT_STAGES.indexOf(job.stage) + 1];
        if (next !== parsed.stage) throw new AdminControlError('INVALID_STATE');
        return db.tenant_provisioning.update(
          job.id,
          { stage: parsed.stage },
          { tx }
        );
      }

      if (parsed.kind === 'failed') {
        const updated = await db.tenant_provisioning.update(
          job.id,
          { status: 'failed', failure_code: parsed.failureCode },
          { tx }
        );
        await appendTenantEvent(
          db,
          {
            event_key: 'tenant.provisioning.failed',
            outcome: 'failed',
            tenant_id: tenantId,
            target_id: tenantId,
            details: {
              step: job.stage,
              code: parsed.failureCode,
              attempt: job.attempts,
            },
          },
          tx
        );
        await advanceTenantCache(db, tenantId, tx);
        return updated;
      }

      if (job.stage !== 'activation')
        throw new AdminControlError('INVALID_STATE');
      if (onCompleted) await onCompleted(tx, job);
      const updated = await db.tenant_provisioning.update(
        job.id,
        { stage: 'complete', status: 'completed', completed_at: new Date() },
        { tx }
      );
      await appendTenantEvent(
        db,
        {
          event_key: 'tenant.provisioning.completed',
          outcome: 'succeeded',
          tenant_id: tenantId,
          target_id: tenantId,
          details: { cell_id: job.cell_id, attempt: job.attempts },
        },
        tx
      );
      await advanceTenantCache(db, tenantId, tx);
      return updated;
    })
  );
}
