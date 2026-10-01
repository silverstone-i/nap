/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AdminControlError, withControlErrors } from './errors.js';
import { accessScope } from './authorization.js';
import { parseLimit, parseUuid } from './validation.js';
import {
  provisionTenant,
  retryTenantProvisioning,
} from './tenantProvisioning.js';
import { TIERS, tenantCodeSchema, tenantNameSchema } from './tenants.js';

/** Advisory lock key serializing concurrent cell registrations. */
const LOCK_KEY = "hashtext('admin-tenancy:cell-registry')";

/** Environments a cell may be registered in, matching `admin.cells`' check constraint. */
export const ENVIRONMENTS = Object.freeze(['dev', 'test', 'prod']);

/** Stages a provisioning operation passes through, in order. */
export const STAGES = Object.freeze([
  'registered',
  'setup',
  'migration',
  'seed',
  'activation',
  'complete',
]);

/** Safe projection of `admin.cells`: no column on this table is secret. */
export const CELL_VIEW_COLUMNS = Object.freeze([
  'id',
  'environment',
  'database_name',
  'enabled',
  'created_at',
  'created_by',
  'updated_at',
  'updated_by',
  'deactivated_at',
]);

/** Safe projection of `admin.cell_provisioning`: no column on this table is secret. */
export const OPERATION_VIEW_COLUMNS = Object.freeze([
  'id',
  'cell_id',
  'operation_id',
  'requested_action',
  'stage',
  'status',
  'attempts',
  'failure_code',
  'started_at',
  'completed_at',
  'created_at',
  'updated_at',
]);

/**
 * @typedef {object} AdminCellsDb
 * @property {import('../models/cells.js').Cells} cells
 * @property {import('../models/cell_provisioning.js').CellProvisioning} cell_provisioning
 * @property {import('../models/tenants.js').Tenants} tenants
 * @property {import('../models/managed_events.js').ManagedEvents} managed_events
 * @property {(operation: (tx: object) => Promise<unknown>) => Promise<unknown>} tx
 */

/**
 * @typedef {object} ControlAuthority
 * @property {string} actorId
 * @property {boolean} granted Whether the requested `admin-tenancy::control::*`
 *   capability is present at all.
 */

/**
 * Turn an I0005 decision into a `ControlAuthority`.
 *
 * `admin.cells` has no tenant of its own, so the general-purpose
 * `AdminAccessScope` (built for tenant-scoped reads) does not fit cleanly;
 * this is the minimal shape cell control actually needs: whether the
 * capability was permitted.
 * @param {{actorId: string, decision: 'permit'|'deny'}} authorization An `authorize` result.
 * @returns {ControlAuthority}
 */
export function buildControlAuthority(authorization) {
  return {
    actorId: authorization.actorId,
    granted: accessScope(authorization).tenantIds === '*',
  };
}

/**
 * Require write or read authority, whichever `authority` was built for.
 * @param {unknown} authority
 * @returns {ControlAuthority}
 * @throws {AdminControlError} `INVALID_INPUT`, `FORBIDDEN`
 */
function requireGranted(authority) {
  const result = authoritySchema.safeParse(authority);
  if (!result.success) throw new AdminControlError('INVALID_INPUT');
  if (!result.data.granted) throw new AdminControlError('FORBIDDEN');
  return result.data;
}

const authoritySchema = z.strictObject({
  actorId: z.uuid(),
  granted: z.boolean(),
});

const suffixSchema = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/);

/**
 * Validate a cell suffix: 1–32 lowercase ASCII letters, digits, or hyphens,
 * starting and ending with a letter or digit (never a hyphen).
 * @param {unknown} value
 * @returns {string}
 * @throws {AdminControlError} `INVALID_INPUT`
 */
export function parseSuffix(value) {
  const result = suffixSchema.safeParse(value);
  if (!result.success) throw new AdminControlError('INVALID_INPUT');
  return result.data;
}

/**
 * Validate a cell environment.
 * @param {unknown} value
 * @returns {'dev'|'test'|'prod'}
 * @throws {AdminControlError} `INVALID_INPUT`
 */
export function parseEnvironment(value) {
  if (!ENVIRONMENTS.includes(value))
    throw new AdminControlError('INVALID_INPUT');
  return value;
}

/**
 * Derive a cell's database name from its environment and suffix.
 * @param {'dev'|'test'|'prod'} environment
 * @param {string} suffix
 * @returns {string}
 * @throws {AdminControlError} `INVALID_INPUT` when the name would not fit PostgreSQL's 63-byte identifier limit.
 */
export function databaseName(environment, suffix) {
  const name = `nap_${environment}_cell_${suffix}`;
  if (name.length > 63) throw new AdminControlError('INVALID_INPUT');
  return name;
}

/**
 * Reduce a cell row to its safe view.
 * @param {object} row
 * @returns {object}
 */
export function cellView(row) {
  return Object.fromEntries(
    CELL_VIEW_COLUMNS.map(column => [column, row[column]])
  );
}

/**
 * Reduce a provisioning row to its safe view.
 * @param {object} row
 * @returns {object}
 */
export function operationView(row) {
  return Object.fromEntries(
    OPERATION_VIEW_COLUMNS.map(column => [column, row[column]])
  );
}

/**
 * Append one cell-management event, generating its deduplication key.
 * @param {AdminCellsDb} db
 * @param {object} event
 * @param {object} tx
 * @returns {Promise<void>}
 */
async function appendCellEvent(db, event, tx) {
  await db.managed_events.append(
    { deduplication_key: randomUUID(), target_type: 'cell', ...event },
    { tx }
  );
}

/**
 * Register a new cell and queue its provisioning operation.
 *
 * M0001-06-R001, M0001-06-R005. The advisory lock serializes concurrent
 * registrations so the identity check and the insert cannot race — two
 * requests for the same environment and suffix cannot both create a row.
 * Registration never touches a physical database; it only records intent.
 * @param {AdminCellsDb} db
 * @param {'dev'|'test'|'prod'} environment The running API's own configured environment, never client-supplied.
 * @param {unknown} authority
 * @param {unknown} body `{ operation: 'cell', suffix }`
 * @param {{requestId?: string|null}} [context]
 * @returns {Promise<{cell: object, operation: object}>}
 * @throws {AdminControlError} `INVALID_INPUT`, `FORBIDDEN`, `CONFLICT`, `AUDIT_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function registerCell(
  db,
  environment,
  authority,
  body,
  { requestId = null } = {}
) {
  const granted = requireGranted(authority);
  const parsedEnvironment = parseEnvironment(environment);
  const result = z
    .strictObject({ operation: z.literal('cell'), suffix: suffixSchema })
    .safeParse(body);
  if (!result.success) throw new AdminControlError('INVALID_INPUT');
  const name = databaseName(parsedEnvironment, result.data.suffix);
  return withControlErrors(() =>
    db.tx(async tx => {
      await tx.one(`SELECT pg_advisory_xact_lock(${LOCK_KEY})`);
      const existing = await db.cells.findActiveByIdentity(
        parsedEnvironment,
        name,
        { tx }
      );
      if (existing) throw new AdminControlError('CONFLICT');
      const cell = await db.cells.insert(
        {
          environment: parsedEnvironment,
          database_name: name,
          enabled: false,
        },
        { tx }
      );
      const operation = await db.cell_provisioning.insert(
        {
          cell_id: cell.id,
          requested_action: 'provision',
          stage: 'registered',
          status: 'queued',
        },
        { tx }
      );
      await appendCellEvent(
        db,
        {
          event_key: 'cell.registered',
          outcome: 'succeeded',
          request_id: requestId,
          actor_id: granted.actorId,
          target_id: cell.id,
        },
        tx
      );
      return { cell: cellView(cell), operation: operationView(operation) };
    })
  );
}

/**
 * Retry a cell's provisioning operation.
 *
 * M0001-06-R003. Retry is allowed only from `failed`; a repeated retry while
 * `queued` or `running` returns the current operation unchanged, and a
 * `completed` operation cannot be retried at all. The lock on the
 * provisioning row is what makes this decision race-free under concurrent
 * retry requests (M0001-06 AC04): two callers cannot both observe `failed`
 * and both reset the row.
 * @param {AdminCellsDb} db
 * @param {unknown} authority
 * @param {unknown} cellId
 * @param {{requestId?: string|null}} [context]
 * @returns {Promise<object>} Safe operation view.
 * @throws {AdminControlError} `INVALID_INPUT`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE`, `AUDIT_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function retryCellProvisioning(
  db,
  authority,
  cellId,
  { requestId = null } = {}
) {
  const granted = requireGranted(authority);
  const id = parseUuidOrControl(cellId);
  return withControlErrors(() =>
    db.tx(async tx => {
      const operation = await db.cell_provisioning.lockByCellId(id, { tx });
      if (!operation) throw new AdminControlError('NOT_FOUND');
      if (operation.status === 'queued' || operation.status === 'running')
        return operationView(operation);
      if (operation.status !== 'failed')
        throw new AdminControlError('INVALID_STATE');
      const updated = await db.cell_provisioning.update(
        operation.id,
        {
          stage: 'registered',
          status: 'queued',
          attempts: operation.attempts + 1,
          failure_code: null,
          started_at: null,
          completed_at: null,
        },
        { tx }
      );
      await appendCellEvent(
        db,
        {
          event_key: 'cell.retry.requested',
          outcome: 'succeeded',
          request_id: requestId,
          actor_id: granted.actorId,
          target_id: id,
          details: { attempt: updated.attempts },
        },
        tx
      );
      return operationView(updated);
    })
  );
}

/**
 * Disable a cell, without deleting its registry record or physical database.
 *
 * M0001-06-R004. Idempotent: disabling an already-disabled cell succeeds and
 * still records the operator's action.
 * @param {AdminCellsDb} db
 * @param {unknown} authority
 * @param {unknown} cellId
 * @param {{requestId?: string|null}} [context]
 * @returns {Promise<object>} Safe cell view.
 * @throws {AdminControlError} `INVALID_INPUT`, `FORBIDDEN`, `NOT_FOUND`, `AUDIT_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function disableCell(
  db,
  authority,
  cellId,
  { requestId = null } = {}
) {
  const granted = requireGranted(authority);
  const id = parseUuidOrControl(cellId);
  return withControlErrors(() =>
    db.tx(async tx => {
      const row = await db.cells.update(id, { enabled: false }, { tx });
      if (!row) throw new AdminControlError('NOT_FOUND');
      await appendCellEvent(
        db,
        {
          event_key: 'cell.disabled',
          outcome: 'succeeded',
          request_id: requestId,
          actor_id: granted.actorId,
          target_id: id,
        },
        tx
      );
      return cellView(row);
    })
  );
}

/**
 * Queue re-activation of a disabled, fully provisioned cell.
 *
 * I0003-R027/R028. Only a disabled cell whose last job is `completed` can be
 * activated; the worker then runs the activation stage alone, reusing the
 * saved connection.
 * @param {AdminCellsDb} db
 * @param {unknown} authority
 * @param {unknown} cellId
 * @param {{requestId?: string|null}} [context]
 * @returns {Promise<object>} Safe operation view.
 * @throws {AdminControlError} `INVALID_INPUT`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE`, `AUDIT_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function activateCell(
  db,
  authority,
  cellId,
  { requestId = null } = {}
) {
  const granted = requireGranted(authority);
  const id = parseUuidOrControl(cellId);
  return withControlErrors(() =>
    db.tx(async tx => {
      const operation = await db.cell_provisioning.lockByCellId(id, { tx });
      if (!operation) throw new AdminControlError('NOT_FOUND');
      const cell = await db.cells.findOneBy({ id }, { tx });
      if (!cell || cell.enabled || operation.status !== 'completed')
        throw new AdminControlError('INVALID_STATE');
      const updated = await db.cell_provisioning.update(
        operation.id,
        {
          requested_action: 'activate',
          stage: 'activation',
          status: 'queued',
          failure_code: null,
          started_at: null,
          completed_at: null,
        },
        { tx }
      );
      await appendCellEvent(
        db,
        {
          event_key: 'cell.activate.requested',
          outcome: 'succeeded',
          request_id: requestId,
          actor_id: granted.actorId,
          target_id: id,
        },
        tx
      );
      return operationView(updated);
    })
  );
}

/**
 * A cell's reference-seed state (I0007-R010), from its job and the runtime
 * cell registry's readiness.
 * @param {{requested_action: string, status: string}|null|undefined} operation
 * @param {{ready: boolean, reason?: string}|undefined} readiness
 * @returns {'current'|'missing'|'queued'|'running'|'failed'|'unknown'}
 */
export function seedStateOf(operation, readiness) {
  if (
    operation?.requested_action === 'seed' &&
    operation.status !== 'completed'
  )
    return operation.status;
  if (readiness?.ready) return 'current';
  if (readiness?.reason === 'SEED_MISSING' && operation?.status === 'completed')
    return 'missing';
  return 'unknown';
}

/**
 * Queue a `seed` job on one locked cell (I0007-R006, R016). A job already
 * `queued` or `running` is returned unchanged with `alreadyQueued`.
 * @param {AdminCellsDb} db
 * @param {{actorId: string}} granted
 * @param {string} id
 * @param {{readiness: Function, seedVersion?: number}|undefined} runtime
 * @param {string|null} requestId
 * @returns {Promise<{operation: object, alreadyQueued: boolean}>}
 * @throws {AdminControlError} `NOT_FOUND`, `INVALID_STATE`
 */
function queueSeed(db, granted, id, runtime, requestId) {
  return db.tx(async tx => {
    const operation = await db.cell_provisioning.lockByCellId(id, { tx });
    if (!operation) throw new AdminControlError('NOT_FOUND');
    if (operation.status === 'queued' || operation.status === 'running')
      return { operation: operationView(operation), alreadyQueued: true };
    if (seedStateOf(operation, runtime?.readiness(id)) !== 'missing')
      throw new AdminControlError('INVALID_STATE');
    const updated = await db.cell_provisioning.update(
      operation.id,
      {
        requested_action: 'seed',
        stage: 'seed',
        status: 'queued',
        failure_code: null,
        started_at: null,
        completed_at: null,
      },
      { tx }
    );
    // I0007-R008.
    await appendCellEvent(
      db,
      {
        event_key: 'cell.seed.requested',
        outcome: 'succeeded',
        request_id: requestId,
        actor_id: granted.actorId,
        target_id: id,
        details: { seed_version: runtime?.seedVersion ?? null },
      },
      tx
    );
    return { operation: operationView(updated), alreadyQueued: false };
  });
}

/**
 * Queue a `seed` job that loads the declared reference seed into one
 * existing cell (I0007-R006).
 * @param {AdminCellsDb} db
 * @param {unknown} authority
 * @param {unknown} cellId
 * @param {{requestId?: string|null, runtime?: object}} [context]
 * @returns {Promise<object>} Safe operation view.
 * @throws {AdminControlError} `INVALID_INPUT`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE`, `AUDIT_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function seedCell(
  db,
  authority,
  cellId,
  { requestId = null, runtime } = {}
) {
  const granted = requireGranted(authority);
  const id = parseUuidOrControl(cellId);
  return withControlErrors(async () => {
    const { operation } = await queueSeed(db, granted, id, runtime, requestId);
    return operation;
  });
}

/**
 * Queue a `seed` job for every eligible cell, each in its own transaction
 * (I0007-R007, R008). One cell's failure does not stop the others.
 * @param {AdminCellsDb} db
 * @param {unknown} authority
 * @param {{requestId?: string|null, runtime?: object}} [context]
 * @returns {Promise<{declaredVersion: number|null, queued: string[], skipped: {cell: string, reason: string}[]}>}
 * @throws {AdminControlError} `FORBIDDEN`, `AUDIT_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function rolloutReferenceData(
  db,
  authority,
  { requestId = null, runtime } = {}
) {
  const granted = requireGranted(authority);
  return withControlErrors(async () => {
    const states = await db.cell_provisioning.listStates();
    const candidates = states
      .filter(row => runtime?.readiness(row.cell_id)?.reason === 'SEED_MISSING')
      .map(row => row.cell_id);
    const queued = [];
    const skipped = [];
    for (const cell of candidates) {
      try {
        const { alreadyQueued } = await queueSeed(
          db,
          granted,
          cell,
          runtime,
          requestId
        );
        if (alreadyQueued) skipped.push({ cell, reason: 'ALREADY_QUEUED' });
        else queued.push(cell);
      } catch (error) {
        skipped.push({ cell, reason: error?.code ?? 'INTERNAL_ERROR' });
      }
    }
    const declaredVersion = runtime?.seedVersion ?? null;
    await db.tx(tx =>
      db.managed_events.append(
        {
          deduplication_key: randomUUID(),
          target_type: 'reference-seed',
          event_key: 'reference.rollout.requested',
          outcome: 'succeeded',
          request_id: requestId,
          actor_id: granted.actorId,
          target_id: null,
          details: {
            seed_version: declaredVersion,
            queued: queued.length,
            skipped: skipped.length,
          },
        },
        { tx }
      )
    );
    return { declaredVersion, queued, skipped };
  });
}

const provisionCommandSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('cell-retry'), cell: z.uuid() }),
  z.strictObject({ operation: z.literal('cell-disable'), cell: z.uuid() }),
  z.strictObject({ operation: z.literal('cell-activate'), cell: z.uuid() }),
  z.strictObject({ operation: z.literal('cell-seed'), cell: z.uuid() }),
  z.strictObject({ operation: z.literal('reference-rollout') }),
  z.strictObject({
    operation: z.literal('tenant-provision'),
    // I0006-R001: a new tenant starts from an active Napsoft client.
    client: z.uuid(),
    code: tenantCodeSchema,
    name: tenantNameSchema,
    tier: z.enum(TIERS),
    cell: z.uuid(),
    admin: z.strictObject({
      email: z.string(),
      password: z.string(),
      // M0005-R021: the administrator's name for their employee record.
      firstName: z.string().trim().min(1).max(160),
      lastName: z.string().trim().min(1).max(160),
    }),
  }),
  z.strictObject({ operation: z.literal('tenant-retry'), tenant: z.uuid() }),
]);

/**
 * Validate and dispatch a `POST /control/provision` command.
 * @param {AdminCellsDb} db
 * @param {unknown} authority
 * @param {unknown} body A cell command `{operation, cell}`, or a tenant command (I0006-R001, R004).
 * @param {{requestId?: string|null, idempotencyKey?: unknown, runtime?: object, hashingPolicy?: unknown}} [context]
 * @returns {Promise<object>} A safe operation view for `cell-retry` and `cell-activate`, a safe cell view for `cell-disable`, a tenant job view for tenant commands.
 * @throws {AdminControlError} `INVALID_INPUT`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE`, `CELL_UNAVAILABLE`, `CONFLICT`, `IDEMPOTENCY_CONFLICT`, `AUDIT_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function executeProvisionCommand(
  db,
  authority,
  body,
  { requestId = null, idempotencyKey, runtime, hashingPolicy } = {}
) {
  const result = provisionCommandSchema.safeParse(body);
  if (!result.success) throw new AdminControlError('INVALID_INPUT');
  const command = result.data;
  if (command.operation === 'tenant-provision')
    return provisionTenant(db, authority, command, idempotencyKey, {
      requestId,
      runtime,
      hashingPolicy,
    });
  if (command.operation === 'tenant-retry')
    return retryTenantProvisioning(db, authority, command.tenant, {
      requestId,
    });
  if (command.operation === 'cell-retry')
    return retryCellProvisioning(db, authority, command.cell, { requestId });
  if (command.operation === 'cell-activate')
    return activateCell(db, authority, command.cell, { requestId });
  if (command.operation === 'cell-seed')
    return seedCell(db, authority, command.cell, { requestId, runtime });
  if (command.operation === 'reference-rollout')
    return rolloutReferenceData(db, authority, { requestId, runtime });
  return disableCell(db, authority, command.cell, { requestId });
}

/**
 * Move a locked, queued operation to `running` (I0003 §8).
 *
 * A `provision` job starts, and restarts after a stopped worker, at `setup`;
 * an `activate` or `seed` job at its own first stage (`activation`, `seed`).
 * Restarting is safe because every stage reuses work it already did, and
 * publishing and seeding are idempotent. Attempts are counted by retry, not
 * here (M0001-06 §13).
 * @param {AdminCellsDb} db
 * @param {object} operation Row locked in `tx`.
 * @param {import('pg-promise').IDatabase<unknown>} tx
 * @returns {Promise<object>} The updated row.
 * @throws {AdminControlError} `INVALID_STATE`
 */
async function startOperation(db, operation, tx) {
  if (operation.status !== 'queued')
    throw new AdminControlError('INVALID_STATE');
  // An `activate` or `seed` job always restarts at its first stage, whether
  // retried from `registered` (I0007-R005) or requeued mid-stage by a stopped
  // worker: publishing and seeding are idempotent (I0007-R003, R018).
  const first = { activate: 'activation', seed: 'seed' }[
    operation.requested_action
  ];
  if (first)
    return db.cell_provisioning.update(
      operation.id,
      { stage: first, status: 'running', started_at: new Date() },
      { tx }
    );
  return db.cell_provisioning.update(
    operation.id,
    { stage: 'setup', status: 'running', started_at: new Date() },
    { tx }
  );
}

/**
 * Claim the next queued job for the in-process worker (I0003-R004).
 *
 * The claim and the move to `running` share one transaction, and the lock
 * skips rows another worker holds, so two API instances never run the same
 * job.
 * @param {AdminCellsDb} db
 * @returns {Promise<object|null>} Safe operation view, or null when none is queued.
 */
export async function claimCellProvisioning(db) {
  return withControlErrors(() =>
    db.tx(async tx => {
      const operation = await db.cell_provisioning.lockNextQueued({ tx });
      if (!operation) return null;
      return operationView(await startOperation(db, operation, tx));
    })
  );
}

const transitionSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('started') }),
  z.strictObject({
    kind: z.literal('advanced'),
    stage: z.enum(['migration', 'seed', 'activation']),
  }),
  z.strictObject({
    kind: z.literal('failed'),
    failureCode: z.string().min(1).max(64),
  }),
  z.strictObject({ kind: z.literal('completed') }),
]);

/**
 * Accept a trusted progress update from the provisioning runner.
 *
 * Never reachable over HTTP — "the runner uses an internal method, not a
 * public HTTP route" (§10). The caller is the runner itself, a trusted
 * in-process context, so this takes no operator authority; the lock on the
 * operation row is what makes concurrent updates from more than one runner
 * pass safe.
 * @param {AdminCellsDb} db
 * @param {unknown} operationId
 * @param {unknown} transition One of the shapes `transitionSchema` accepts.
 * @param {{onCompleted?: (tx: object, operation: object) => Promise<void>}} [hooks]
 *   `onCompleted` runs inside the transaction that completes the job, so a
 *   caller's write commits or rolls back with the completion (I0003-R024.1).
 * @returns {Promise<object>} Safe operation view.
 * @throws {AdminControlError} `INVALID_INPUT`, `NOT_FOUND`, `INVALID_STATE`, `AUDIT_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function advanceCellProvisioning(
  db,
  operationId,
  transition,
  { onCompleted } = {}
) {
  const id = parseUuidOrControl(operationId);
  const result = transitionSchema.safeParse(transition);
  if (!result.success) throw new AdminControlError('INVALID_INPUT');
  const parsed = result.data;
  return withControlErrors(() =>
    db.tx(async tx => {
      const operation = await db.cell_provisioning.lockByOperationId(id, {
        tx,
      });
      if (!operation) throw new AdminControlError('NOT_FOUND');

      if (parsed.kind === 'started')
        return operationView(await startOperation(db, operation, tx));

      if (operation.status !== 'running')
        throw new AdminControlError('INVALID_STATE');

      if (parsed.kind === 'advanced') {
        const next = STAGES.indexOf(operation.stage) + 1;
        if (STAGES[next] !== parsed.stage)
          throw new AdminControlError('INVALID_STATE');
        const updated = await db.cell_provisioning.update(
          operation.id,
          { stage: parsed.stage },
          { tx }
        );
        return operationView(updated);
      }

      if (parsed.kind === 'failed') {
        const updated = await db.cell_provisioning.update(
          operation.id,
          { status: 'failed', failure_code: parsed.failureCode },
          { tx }
        );
        // I0007-R017: a `seed` job runs on an enabled cell; failure leaves
        // it disabled like every other failed job (M0001-06-R006).
        if (operation.requested_action === 'seed')
          await db.cells.update(operation.cell_id, { enabled: false }, { tx });
        await appendCellEvent(
          db,
          {
            event_key: 'cell.provisioning.failed',
            outcome: 'failed',
            target_id: operation.cell_id,
            details: {
              step: operation.stage,
              code: parsed.failureCode,
              attempt: operation.attempts,
            },
          },
          tx
        );
        return operationView(updated);
      }

      // kind === 'completed'
      if (operation.stage !== 'activation')
        throw new AdminControlError('INVALID_STATE');
      const updated = await db.cell_provisioning.update(
        operation.id,
        { stage: 'complete', status: 'completed', completed_at: new Date() },
        { tx }
      );
      await db.cells.update(operation.cell_id, { enabled: true }, { tx });
      if (onCompleted) await onCompleted(tx, operation);
      await appendCellEvent(
        db,
        {
          event_key: 'cell.provisioning.completed',
          outcome: 'succeeded',
          target_id: operation.cell_id,
          details: { attempt: operation.attempts },
        },
        tx
      );
      return operationView(updated);
    })
  );
}

const cellCursorSchema = z.strictObject({
  v: z.literal(1),
  op: z.literal('listCellOverview'),
  last: z.uuid(),
});

/**
 * Decode and validate an opaque cell-overview cursor.
 * @param {unknown} cursor
 * @returns {{id: string}|null}
 * @throws {AdminControlError} `INVALID_INPUT`
 */
function parseCellCursor(cursor) {
  if (cursor === undefined || cursor === null) return null;
  if (typeof cursor !== 'string' || cursor.length === 0)
    throw new AdminControlError('INVALID_INPUT');
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new AdminControlError('INVALID_INPUT');
  }
  const result = cellCursorSchema.safeParse(decoded);
  if (!result.success) throw new AdminControlError('INVALID_INPUT');
  return { id: result.data.last };
}

/**
 * Encode the next cell-overview page's cursor.
 * @param {{id: string}|null} nextCursor
 * @returns {string|null}
 */
function encodeCellCursor(nextCursor) {
  if (!nextCursor) return null;
  const payload = { v: 1, op: 'listCellOverview', last: nextCursor.id };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/**
 * Validate a UUID path/query argument, reporting the control error code.
 * @param {unknown} value
 * @returns {string}
 * @throws {AdminControlError} `INVALID_INPUT`
 */
function parseUuidOrControl(value) {
  try {
    return parseUuid(value);
  } catch {
    throw new AdminControlError('INVALID_INPUT');
  }
}

/**
 * Apply the shared 50/100 page limit, reporting the control error code.
 * @param {unknown} value
 * @returns {number}
 * @throws {AdminControlError} `INVALID_INPUT`
 */
function parseLimitOrControl(value) {
  try {
    return parseLimit(value);
  } catch {
    throw new AdminControlError('INVALID_INPUT');
  }
}

/**
 * List every registered cell with its provisioning operation, in ascending
 * `id` order, paginated by opaque cursor.
 *
 * The order is stable, not chronological: `id` is a `gen_random_uuid()`
 * primary key, so ascending `id` has no relationship to registration time.
 * It is what makes cursor pagination deterministic, the same tradeoff
 * `access.js`'s membership lists make.
 *
 * Unlike tenant or membership reads, this list carries no tenant scoping:
 * §4 grants `admin-tenancy::control::read` no Napsoft carve-out, only the
 * write actions do.
 * @param {AdminCellsDb} db
 * @param {unknown} authority
 * @param {{cursor?: unknown, limit?: unknown, runtime?: {readiness: (cellId: string) => {ready: boolean}}}} [page]
 * @returns {Promise<{rows: {cell: object, operation: object|null, ready: boolean}[], nextCursor: string|null}>}
 * @throws {AdminControlError} `INVALID_INPUT`, `FORBIDDEN`, `INTERNAL_ERROR`
 */
export async function getOverview(
  db,
  authority,
  { cursor, limit, runtime } = {}
) {
  requireGranted(authority);
  const parsedLimit = parseLimitOrControl(limit);
  const resumeFrom = parseCellCursor(cursor);
  return withControlErrors(async () => {
    const page = await db.cells.findAfterCursor(
      resumeFrom ?? {},
      parsedLimit,
      ['id'],
      { columnWhitelist: CELL_VIEW_COLUMNS }
    );
    const ids = page.rows.map(row => row.id);
    const operations = ids.length
      ? await db.cell_provisioning.findWhere({ cell_id: { $in: ids } }, 'AND', {
          columnWhitelist: OPERATION_VIEW_COLUMNS,
        })
      : [];
    const anyActive = await db.cell_provisioning.hasActive();
    const byCellId = new Map(operations.map(row => [row.cell_id, row]));
    // I0007-R009: counts cover every cell, not just this page.
    const referenceSeed = {
      declaredVersion: runtime?.seedVersion ?? null,
      current: 0,
      missing: 0,
      queued: 0,
      running: 0,
      failed: 0,
    };
    for (const row of await db.cell_provisioning.listStates()) {
      const state = seedStateOf(row, runtime?.readiness(row.cell_id));
      if (state in referenceSeed) referenceSeed[state] += 1;
    }
    return {
      rows: page.rows.map(row => ({
        cell: cellView(row),
        operation: byCellId.has(row.id)
          ? operationView(byCellId.get(row.id))
          : null,
        // I0006-R010: the Tenants screen offers only ready cells.
        ready: Boolean(runtime?.readiness(row.id)?.ready),
        seedState: seedStateOf(
          byCellId.get(row.id),
          runtime?.readiness(row.id)
        ),
      })),
      nextCursor: encodeCellCursor(page.nextCursor),
      anyActive,
      referenceSeed,
    };
  });
}

/**
 * Read one cell's central registry state and provisioning operation,
 * distinguished from its runtime readiness.
 *
 * M0001-06-R007: the central `enabled` flag is not proof of runtime
 * readiness. Runtime readiness is a separate, infrastructure-owned result
 * (docs/architecture/admin-cells.md, Cross-Module Interactions) that no
 * runtime cell registry exists to compute yet; without a `runtime`
 * collaborator this honestly reports "not checked" rather than fabricating a
 * pass.
 * @param {AdminCellsDb} db
 * @param {unknown} authority
 * @param {unknown} cellId
 * @param {{runtime?: {readiness: (cellId: string) => Promise<object>|object}}} [collaborators]
 * @returns {Promise<{cell: object, operation: object|null, runtime: object}>}
 * @throws {AdminControlError} `INVALID_INPUT`, `FORBIDDEN`, `NOT_FOUND`, `INTERNAL_ERROR`
 */
export async function getCellReadiness(
  db,
  authority,
  cellId,
  { runtime } = {}
) {
  requireGranted(authority);
  const id = parseUuidOrControl(cellId);
  return withControlErrors(async () => {
    const cell = await db.cells.findOneBy(
      { id },
      { columnWhitelist: CELL_VIEW_COLUMNS }
    );
    if (!cell) throw new AdminControlError('NOT_FOUND');
    const operation = await db.cell_provisioning.findOneBy(
      { cell_id: id },
      { columnWhitelist: OPERATION_VIEW_COLUMNS }
    );
    const runtimeReadiness = runtime
      ? await runtime.readiness(id)
      : { ready: false, checked: false };
    return {
      cell: cellView(cell),
      operation: operation ? operationView(operation) : null,
      runtime: runtimeReadiness,
    };
  });
}
