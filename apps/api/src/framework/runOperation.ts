/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { DatabaseError, SchemaDefinitionError, TableModel } from 'pg-schemata';
import { withTenantTransaction } from '../db/withTenantTransaction.js';
import { HttpError } from '../util/httpError.js';
import type { Response } from 'express';
import type { CellDatabase } from '../db/cell/index.js';
import type { CellTransaction } from '../db/withTenantTransaction.js';
import type { ResolvedSession } from '../middleware/session.js';
import type { Row } from './modelContract.js';

/**
 * Does: Returns the resolved session stored on the response.
 * Called by: every framework handler, after the session gates have run.
 * @throws If no session is stored, which the gates prevent; the error
 * handler answers INTERNAL_ERROR because that would be a framework defect.
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
 * Does: Turns a database failure into the API error a client may see, or
 * returns the failure unchanged when it is not one a client caused.
 * Called by: runInTenant when the work throws.
 * Why: a unique violation is a conflict; foreign-key, check, not-null, and
 * data-format failures are invalid input; a model validation failure the
 * handler's own checks did not catch is invalid input too. Everything else
 * stays an unexpected failure so the error handler logs it and answers
 * generically (operational standards).
 */
function mapFailure(error: unknown) {
  if (error instanceof HttpError) return error;
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
 * Called by: every framework handler, exactly once per request.
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
 * Does: Returns true when a value is a writable table model.
 * Called by: tableModel.
 */
function isTableModel(value: unknown): value is TableModel<Row> {
  return value instanceof TableModel;
}

/**
 * Does: Returns the named repository from a tenant transaction as a
 * writable table model.
 * Called by: the write handlers, inside runInTenant.
 * @throws If the repository is not a table model, which createRouter checks
 * at construction, so this cannot happen on a registered route.
 */
export function tableModel<R>(
  tx: CellTransaction<R>,
  repository: keyof R & string
): TableModel<Row> {
  const model: unknown = tx[repository];
  if (!isTableModel(model)) {
    throw new Error(`Repository is not writable: ${repository}`);
  }
  return model;
}
