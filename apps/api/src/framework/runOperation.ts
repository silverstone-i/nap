/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { databaseUnavailable } from '../util/databaseUnavailable.js';
import { DatabaseError, SchemaDefinitionError, TableModel } from 'pg-schemata';
import { withAdminTransaction } from '../db/withAdminTransaction.js';
import { withTenantTransaction } from '../db/withTenantTransaction.js';
import { HttpError } from '../util/httpError.js';
import type { Response } from 'express';
import type { AdminDatabase } from '../db/admin/index.js';
import type { CellDatabase } from '../db/cell/index.js';
import type { AdminTransaction } from '../db/withAdminTransaction.js';
import type { CellTransaction } from '../db/withTenantTransaction.js';
import type { ResolvedSession } from '../middleware/session.js';
import type { Row } from './modelContract.js';
import type { HandleBinding } from './ReadController.js';

/**
 * Does: Types the transaction a framework operation receives: the query
 * executor plus the repositories of whichever database the router is bound
 * to.
 * Used by: runOperation and the extension operations modules write.
 * Why: a cell transaction and an admin transaction expose the same query
 * surface; only how they are opened differs, and runOperation owns that.
 */
export type RepositoryTransaction<R> = CellTransaction<R> | AdminTransaction<R>;

/**
 * Does: Returns the resolved session stored on the response, with its
 * active tenant.
 * Called by: every standard framework handler, after the session gates have
 * run.
 * @throws If no session or no tenant is stored, which the gates prevent; the
 * error handler answers INTERNAL_ERROR because that would be a framework
 * defect.
 */
export function resolvedSession(
  response: Response
): ResolvedSession & { readonly tenantId: string } {
  const session = response.locals.session;
  const tenantId = session?.tenantId;
  if (!session || !tenantId)
    throw new Error('Framework route ran without a session');
  return { ...session, tenantId };
}

/**
 * Does: Returns the resolved session stored on the response, whether or not
 * it names a tenant.
 * Called by: the extension handler of a route declared authenticated, after
 * the session gate has run.
 * @throws If no session is stored, which the gate prevents.
 */
export function requiredSession(response: Response): ResolvedSession {
  const session = response.locals.session;
  if (!session) throw new Error('Framework route ran without a session');
  return session;
}

/**
 * Does: Turns a database failure into the API error a client may see, or
 * returns the failure unchanged when it is not one a client caused.
 * Called by: runInTenant and runInAdmin when the work throws.
 * Why: a unique violation is a conflict; foreign-key, check, not-null, and
 * data-format failures are invalid input; a model validation failure the
 * handler's own checks did not catch is invalid input too. Everything else
 * stays an unexpected failure so the error handler logs it and answers
 * generically (operational standards).
 */
function mapFailure(error: unknown) {
  if (error instanceof HttpError) return error;
  if (databaseUnavailable(error)) return new HttpError('SERVICE_UNAVAILABLE');
  if (error instanceof SchemaDefinitionError)
    return new HttpError('INVALID_INPUT');
  if (error instanceof DatabaseError && typeof error.code === 'string') {
    if (error.code === '23505') return new HttpError('CONFLICT');
    if (
      ['23503', '23514', '23502'].includes(error.code) ||
      error.code.startsWith('22')
    )
      return new HttpError('INVALID_INPUT');
  }
  return error;
}

/**
 * Does: Runs one operation inside the active tenant's transaction and
 * returns its result, translating database failures into API errors.
 * Called by: runOperation for a cell-bound router, exactly once per request.
 * Why: the framework HTTP contract requires exactly one tenant transaction
 * around the operation, opened with the tenant the server resolved. A thrown
 * error, including a refusal the operation raises, rolls the transaction back
 * before it propagates.
 */
export async function runInTenant<T, R>(
  cellDb: CellDatabase<R>,
  session: ResolvedSession,
  work: (tx: CellTransaction<R>) => Promise<T>
): Promise<T> {
  if (!session.tenantId)
    throw new Error('Framework route ran without a tenant');
  try {
    return await withTenantTransaction(cellDb, session.tenantId, work);
  } catch (error) {
    throw mapFailure(error);
  }
}

/**
 * Does: Runs one operation inside a transaction on the admin database and
 * returns its result, translating database failures into API errors.
 * Called by: runOperation for an admin-bound router, exactly once per
 * request.
 * Why: an admin-targeted controller has no tenant context (framework HTTP
 * contract), so no tenant setting is applied and the session is not needed
 * to open the transaction. Failures map exactly as they do for a tenant
 * transaction, so both kinds of router answer alike.
 */
export async function runInAdmin<T, R>(
  adminDb: AdminDatabase<R>,
  work: (tx: AdminTransaction<R>) => Promise<T>
): Promise<T> {
  try {
    return await withAdminTransaction(adminDb, work);
  } catch (error) {
    throw mapFailure(error);
  }
}

/**
 * Does: Runs one operation in the transaction that fits the router's
 * database: a tenant-scoped one for a cell pool, a plain one for an admin
 * pool.
 * Called by: every framework handler, exactly once per request.
 * Why: the handlers are written once for both kinds of router; this is the
 * only place the difference between them is decided.
 */
export async function runOperation<T, R>(
  binding: HandleBinding<R>,
  session: ResolvedSession | undefined,
  work: (tx: RepositoryTransaction<R>) => Promise<T>
): Promise<T> {
  if (binding.target === 'admin') return runInAdmin(binding.handle, work);
  if (!session) throw new Error('Framework route ran without a session');
  return runInTenant(binding.handle, session, work);
}

/**
 * Does: Returns true when a value is a writable table model.
 * Called by: tableModel.
 */
function isTableModel(value: unknown): value is TableModel<Row> {
  return value instanceof TableModel;
}

/**
 * Does: Returns the named repository from a transaction as a writable table
 * model.
 * Called by: the write handlers, inside runOperation.
 * @throws If the repository is not a table model, which createRouter checks
 * at construction, so this cannot happen on a registered route.
 */
export function tableModel<R>(
  tx: RepositoryTransaction<R>,
  repository: keyof R & string
): TableModel<Row> {
  const model: unknown = tx[repository];
  if (!isTableModel(model)) {
    throw new Error(`Repository is not writable: ${repository}`);
  }
  return model;
}
