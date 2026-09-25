/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AdminControlError, withControlErrors } from './errors.js';
import { accessScope } from './authorization.js';
import { parseLimit, parseUuid } from './validation.js';

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
 * @property {string[]} deniedTenantIds Tenants excluded even though the
 *   capability is granted — carries support's Napsoft restriction.
 */

/**
 * Turn a resolved authorization context into a `ControlAuthority`.
 *
 * `admin.cells` has no tenant of its own, so the general-purpose
 * `AdminAccessScope` (built for tenant-scoped reads) does not fit cleanly;
 * this is the minimal shape cell control actually needs: whether the
 * capability is present, and which tenants — Napsoft, once support exists —
 * are carved out of it.
 * @param {{actorId: string, platformCapabilities: string[]}} context Result of `resolveAuthorization`.
 * @param {string} capability `admin-tenancy::control::read` or `::write`.
 * @returns {ControlAuthority}
 */
export function buildControlAuthority(context, capability) {
  const scope = accessScope(context, capability);
  return {
    actorId: context.actorId,
    granted: scope.tenantIds === '*',
    deniedTenantIds: scope.deniedTenantIds,
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
  deniedTenantIds: z.array(z.uuid()),
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
 * Whether `deniedTenantIds` names a tenant currently assigned to this cell —
 * the check that carries support's Napsoft restriction onto retry and
 * disable (§4 and §12: "Support cannot disable a cell containing the Napsoft
 * tenant"). A brand-new cell from registration is never assigned a tenant, so
 * registration never needs this check.
 * @param {AdminCellsDb} db
 * @param {string[]} deniedTenantIds
 * @param {string} cellId
 * @returns {Promise<boolean>}
 */
async function affectsDeniedTenant(db, deniedTenantIds, cellId) {
  if (!deniedTenantIds.length) return false;
  const hit = await db.tenants.findWhere(
    { cell_id: cellId, id: { $in: deniedTenantIds } },
    'AND',
    { columnWhitelist: ['id'], limit: 1 }
  );
  return hit.length > 0;
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
      if (await affectsDeniedTenant(db, granted.deniedTenantIds, id))
        throw new AdminControlError('FORBIDDEN');
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
      if (await affectsDeniedTenant(db, granted.deniedTenantIds, id))
        throw new AdminControlError('FORBIDDEN');
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
      if (await affectsDeniedTenant(db, granted.deniedTenantIds, id))
        throw new AdminControlError('FORBIDDEN');
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

const provisionCommandSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('cell-retry'), cell: z.uuid() }),
  z.strictObject({ operation: z.literal('cell-disable'), cell: z.uuid() }),
  z.strictObject({ operation: z.literal('cell-activate'), cell: z.uuid() }),
]);

/**
 * Validate and dispatch a `POST /control/provision` command.
 * @param {AdminCellsDb} db
 * @param {unknown} authority
 * @param {unknown} body `{operation: 'cell-retry'|'cell-disable'|'cell-activate', cell}`
 * @param {{requestId?: string|null}} [context]
 * @returns {Promise<object>} A safe operation view for `cell-retry` and `cell-activate`, a safe cell view for `cell-disable`.
 * @throws {AdminControlError} `INVALID_INPUT`, `FORBIDDEN`, `NOT_FOUND`, `INVALID_STATE`, `AUDIT_UNAVAILABLE`, `INTERNAL_ERROR`
 */
export async function executeProvisionCommand(
  db,
  authority,
  body,
  { requestId = null } = {}
) {
  const result = provisionCommandSchema.safeParse(body);
  if (!result.success) throw new AdminControlError('INVALID_INPUT');
  const command = result.data;
  if (command.operation === 'cell-retry')
    return retryCellProvisioning(db, authority, command.cell, { requestId });
  if (command.operation === 'cell-activate')
    return activateCell(db, authority, command.cell, { requestId });
  return disableCell(db, authority, command.cell, { requestId });
}

/**
 * Move a locked, queued operation to `running` (I0003 §8).
 *
 * A `provision` job starts at `setup`; an `activate` job starts at
 * `activation`. Attempts are counted by retry, not here (M0001-06 §13). A job returned to
 * `queued` mid-stage by a stopped worker restarts from `setup`, because every
 * stage reuses work it already did.
 * @param {AdminCellsDb} db
 * @param {object} operation Row locked in `tx`.
 * @param {import('pg-promise').IDatabase<unknown>} tx
 * @returns {Promise<object>} The updated row.
 * @throws {AdminControlError} `INVALID_STATE`
 */
async function startOperation(db, operation, tx) {
  if (operation.status !== 'queued')
    throw new AdminControlError('INVALID_STATE');
  if (operation.requested_action === 'activate') {
    if (operation.stage !== 'activation')
      throw new AdminControlError('INVALID_STATE');
    return db.cell_provisioning.update(
      operation.id,
      { status: 'running', started_at: new Date() },
      { tx }
    );
  }
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
 * @param {{cursor?: unknown, limit?: unknown}} [page]
 * @returns {Promise<{rows: {cell: object, operation: object|null}[], nextCursor: string|null}>}
 * @throws {AdminControlError} `INVALID_INPUT`, `FORBIDDEN`, `INTERNAL_ERROR`
 */
export async function getOverview(db, authority, { cursor, limit } = {}) {
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
    return {
      rows: page.rows.map(row => ({
        cell: cellView(row),
        operation: byCellId.has(row.id)
          ? operationView(byCellId.get(row.id))
          : null,
      })),
      nextCursor: encodeCellCursor(page.nextCursor),
      anyActive,
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
