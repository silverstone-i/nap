/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import express from 'express';
import { z } from 'zod';
import {
  bulkInsertBodySchema,
  bulkUpdateBodySchema,
  exportRowLimit,
  idsBodySchema,
  importQuerySchema,
  listPageSize,
  listResponseSchema,
  successResponseSchema,
  transportVersion,
  updateBodySchema,
  xlsxMediaType,
} from '@nap/shared';
import {
  requireEntitlement,
  requirePermission,
  requireSession,
  requireTenant,
} from '../middleware/session.js';
import { rejectTenantInput } from '../middleware/rejectTenantInput.js';
import { xlsxBody } from '../middleware/xlsxBody.js';
import { sendContract } from '../util/sendContract.js';
import { HttpError } from '../util/httpError.js';
import { fieldError } from '../util/fieldErrors.js';
import { describeModel } from './modelContract.js';
import { WriteController } from './WriteController.js';
import { encodeCursor, parseListQuery } from './listQuery.js';
import { checkRecordColumns, parseAt, withTenant } from './recordInput.js';
import { resolvedSession, runInTenant, tableModel } from './runOperation.js';
import {
  archiveRecords,
  bulkInsertRecords,
  bulkUpdateRecords,
  createRecord,
  exportRecords,
  listRecords,
  readRecord,
  restoreRecords,
  updateRecords,
} from './operations.js';
import { recordsFromWorkbook, workbookFromRecords } from './spreadsheets.js';
import type { RequestHandler, Response, Router } from 'express';
import type { CellTransaction } from '../db/withTenantTransaction.js';
import type { ResolvedSession } from '../middleware/session.js';
import type { ModelContract, Repositories, Row } from './modelContract.js';
import type { ReadController } from './ReadController.js';

/**
 * Does: Lists the actions of the standard route set, in registration order.
 * Used by: createRouter, the routes option, and the conformance tests.
 * Why: the action names the permission suffix, the log label, and the key
 * that disables the route, so one name serves all three.
 */
export const standardActions = [
  'list',
  'create',
  'bulk-insert',
  'update',
  'bulk-update',
  'archive',
  'restore',
  'import-xls',
  'export-xls',
  'read',
] as const;

/**
 * Does: Represents one action of the standard route set.
 * Used by: the routes option of createRouter.
 */
export type StandardAction = (typeof standardActions)[number];

/**
 * Does: Represents the HTTP methods an extension route may use.
 * Used by: ExtensionRoute.
 */
export type RouteMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * Does: Represents the checked inputs an extension operation receives: its
 * body, query, and route parameters, each validated by the route's own
 * schema, and the resolved session.
 * Used by: ExtensionRoute operations.
 */
export type ExtensionInput<B, Q, P> = {
  readonly body: B;
  readonly query: Q;
  readonly params: P;
  readonly session: ResolvedSession & { readonly tenantId: string };
};

/**
 * Does: Describes one operation a module adds beyond the standard set: its
 * action name, method and path, the schemas of its inputs and response, and
 * the operation run inside the tenant transaction.
 * Used by: the extend callback of createRouter.
 * Why: the schemas are required so an extension is validated like a standard
 * route (framework HTTP contract); a route without a body declares
 * z.undefined(), and one without query or route parameters declares an
 * empty strict object.
 */
export type ExtensionRoute<R, B, Q, P> = {
  readonly action: string;
  readonly method: RouteMethod;
  readonly path: string;
  readonly body: z.ZodType<B>;
  readonly query: z.ZodType<Q>;
  readonly params: z.ZodType<P>;
  readonly response: z.ZodType;
  readonly status?: number;
  readonly operation: (
    tx: CellTransaction<R>,
    input: ExtensionInput<B, Q, P>
  ) => Promise<unknown>;
};

/**
 * Does: Represents what a module passes to createRouter beside its
 * controller: the module and router names, which standard routes to leave
 * unregistered, and a callback that adds extension routes.
 * Used by: createRouter and every module router file.
 * Why: R is the repository set of the controller's handle, so an extension
 * operation is typed against the module's own repositories.
 */
export type RouterOptions<R> = {
  readonly module: string;
  readonly router: string;
  readonly routes?: Partial<Record<StandardAction, boolean>>;
  readonly extend?: (
    add: <B, Q, P>(route: ExtensionRoute<R, B, Q, P>) => void
  ) => void;
};

const genericRecord = z.record(z.string(), z.unknown());
const updateShape = updateBodySchema(genericRecord);
const bulkUpdateShape = bulkUpdateBodySchema(genericRecord);

/**
 * Does: Returns the insert and update validators of a writable model.
 * Called by: createRouter when the controller is a WriteController.
 * @throws If the model has no generated validators, which only a read-only
 * projection lacks.
 */
function writeSchemas(contract: ModelContract) {
  const { insertSchema, updateSchema } = contract;
  if (!insertSchema || !updateSchema) {
    throw new Error(`Repository is not writable: ${contract.repository}`);
  }
  return { insertSchema, updateSchema };
}

/**
 * Does: Builds the Express router for a controller: the standard route set,
 * any extension routes, each behind the same gate chain, validation, one
 * tenant transaction, and response-contract check.
 * Called by: a module's router file, once per router, from its exported
 * factory; and by framework tests.
 * Why: this is the one HTTP surface every module presents (ARCH-050). Static
 * paths register before the parameterized read route so none is shadowed. A
 * route disabled through the routes option is never registered, so it
 * answers exactly as an unknown path. Write routes exist only for a
 * WriteController, and archive and restore only for a soft-deleting model.
 * A controller's rbacConfig, when set, must agree with the options.
 * @throws At construction on a defective model, a disagreeing rbacConfig,
 * or an extension that reuses an action or a method and path.
 */
export function createRouter<N extends string, R extends Repositories<N>>(
  controller: ReadController<N, R>,
  options: RouterOptions<R>
): Router {
  const { module, router: name, routes = {} } = options;
  const rbac = controller.rbacConfig;
  if (rbac && (rbac.module !== module || rbac.router !== name)) {
    throw new Error('Controller rbacConfig disagrees with the router options');
  }
  const { cellDb, repository } = controller;
  const contract = describeModel(cellDb, repository, controller.itemSchema);
  const writable = controller instanceof WriteController;
  if (writable && !contract.writable) {
    throw new Error(`Repository is not writable: ${repository}`);
  }
  const disabled = new Set(
    Object.entries(routes)
      .filter(([, enabled]) => enabled === false)
      .map(([action]) => action)
  );
  const router = express.Router();
  const actions = new Set<string>();
  const paths = new Set<string>();
  const single = successResponseSchema(contract.itemSchema);
  const many = successResponseSchema(z.array(contract.itemSchema));
  const list = listResponseSchema(contract.itemSchema);
  const pk = contract.primaryKey;

  /**
   * Does: Registers one route behind the gate chain unless it is disabled,
   * after checking its action and path are unused.
   */
  function route(
    action: string,
    method: RouteMethod,
    path: string,
    ...handlers: RequestHandler[]
  ) {
    if (actions.has(action))
      throw new Error(`Duplicate route action: ${action}`);
    actions.add(action);
    const key = `${method} ${path}`;
    if (paths.has(key)) throw new Error(`Duplicate route path: ${key}`);
    paths.add(key);
    if (disabled.has(action)) return;
    const label: RequestHandler = (_request, response, next) => {
      response.locals.route = `${module}.${name}.${action}`;
      next();
    };
    router[method](
      path,
      label,
      requireSession,
      requireTenant,
      requireEntitlement(module),
      requirePermission(`${module}::${name}::${action}`),
      rejectTenantInput,
      ...handlers
    );
  }

  /** Does: Sends the affected records under data. */
  function sendRecords(response: Response, records: Row[], status = 200) {
    sendContract(
      response,
      many,
      { version: transportVersion, data: records },
      status
    );
  }

  /**
   * Does: Checks and prepares records for insertion: each must be an object
   * of writable columns, receives the active tenant, and passes the model's
   * insert validator.
   */
  function insertable(
    records: unknown[],
    tenantId: string,
    insertSchema: z.ZodType,
    prefix: string
  ) {
    return records.map((record, index) => {
      const path = `${prefix}.${index}`;
      const row = withTenant(
        checkRecordColumns(record, path, contract, 'insert'),
        tenantId
      );
      parseAt(insertSchema, row, path);
      return row;
    });
  }

  route('list', 'get', '/', async (request, response) => {
    const session = resolvedSession(response);
    const query = parseListQuery(request.query, contract, listPageSize);
    const result = await runInTenant(cellDb, session, tx =>
      listRecords(tx[repository], contract, query)
    );
    const page = {
      size: query.size,
      total: result.total,
      ...(result.next ? { cursor: encodeCursor(result.next, query) } : {}),
    };
    sendContract(response, list, {
      version: transportVersion,
      data: result.rows,
      page,
    });
  });

  if (writable) {
    const { insertSchema, updateSchema } = writeSchemas(contract);

    route('create', 'post', '/', async (request, response) => {
      const session = resolvedSession(response);
      const row = withTenant(
        checkRecordColumns(request.body, '', contract, 'insert'),
        session.tenantId
      );
      parseAt(insertSchema, row);
      const created = await runInTenant(cellDb, session, tx =>
        createRecord(tableModel(tx, repository), row)
      );
      sendContract(
        response,
        single,
        { version: transportVersion, data: created },
        201
      );
    });

    route('bulk-insert', 'post', '/bulk-insert', async (request, response) => {
      const session = resolvedSession(response);
      const body = parseAt(bulkInsertBodySchema(genericRecord), request.body);
      const rows = insertable(
        body.records,
        session.tenantId,
        insertSchema,
        'records'
      );
      const inserted = await runInTenant(cellDb, session, tx =>
        bulkInsertRecords(tableModel(tx, repository), contract, rows)
      );
      sendRecords(response, inserted, 201);
    });

    route('update', 'put', '/update', async (request, response) => {
      const session = resolvedSession(response);
      const body = parseAt(updateShape, request.body);
      const changes = checkRecordColumns(
        body.changes,
        'changes',
        contract,
        'update'
      );
      if (Object.keys(changes).length === 0) {
        throw new HttpError(
          'INVALID_INPUT',
          fieldError('changes', 'No changes')
        );
      }
      parseAt(updateSchema, changes, 'changes');
      const rows = await runInTenant(cellDb, session, tx =>
        updateRecords(
          tableModel(tx, repository),
          contract,
          { ids: body.ids, path: index => `ids.${index}` },
          changes
        )
      );
      sendRecords(response, rows);
    });

    route('bulk-update', 'put', '/bulk-update', async (request, response) => {
      const session = resolvedSession(response);
      const body = parseAt(bulkUpdateShape, request.body);
      const ids: string[] = [];
      const records: Row[] = [];
      for (const [index, record] of body.records.entries()) {
        const path = `records.${index}`;
        const { [pk]: id, ...changes } = record;
        if (typeof id !== 'string' || !id) {
          throw new HttpError(
            'INVALID_INPUT',
            fieldError(`${path}.${pk}`, 'Identifier required')
          );
        }
        if (ids.includes(id)) {
          throw new HttpError(
            'INVALID_INPUT',
            fieldError(`${path}.${pk}`, 'Duplicate identifier')
          );
        }
        const checked = checkRecordColumns(changes, path, contract, 'update');
        if (Object.keys(checked).length === 0) {
          throw new HttpError('INVALID_INPUT', fieldError(path, 'No changes'));
        }
        parseAt(updateSchema, checked, path);
        ids.push(id);
        records.push({ ...checked, [pk]: id });
      }
      const rows = await runInTenant(cellDb, session, tx =>
        bulkUpdateRecords(
          tableModel(tx, repository),
          contract,
          { ids, path: index => `records.${index}.${pk}` },
          records
        )
      );
      sendRecords(response, rows);
    });

    if (contract.softDelete) {
      route('archive', 'delete', '/archive', async (request, response) => {
        const session = resolvedSession(response);
        const { ids } = parseAt(idsBodySchema, request.body);
        const rows = await runInTenant(cellDb, session, tx =>
          archiveRecords(tableModel(tx, repository), contract, {
            ids,
            path: index => `ids.${index}`,
          })
        );
        sendRecords(response, rows);
      });

      route('restore', 'patch', '/restore', async (request, response) => {
        const session = resolvedSession(response);
        const { ids } = parseAt(idsBodySchema, request.body);
        const rows = await runInTenant(cellDb, session, tx =>
          restoreRecords(tableModel(tx, repository), contract, {
            ids,
            path: index => `ids.${index}`,
          })
        );
        sendRecords(response, rows);
      });
    } else if (routes.archive === true || routes.restore === true) {
      throw new Error(`Model does not soft-delete: ${repository}`);
    }

    route(
      'import-xls',
      'post',
      '/import-xls',
      xlsxBody,
      async (request, response) => {
        const session = resolvedSession(response);
        const { sheet } = parseAt(importQuerySchema, request.query);
        const body: unknown = request.body;
        if (!Buffer.isBuffer(body)) {
          throw new HttpError(
            'INVALID_INPUT',
            fieldError('', 'Workbook body required')
          );
        }
        const records = recordsFromWorkbook(body, sheet);
        const rows = insertable(
          records,
          session.tenantId,
          insertSchema,
          'records'
        );
        const inserted = await runInTenant(cellDb, session, tx =>
          bulkInsertRecords(tableModel(tx, repository), contract, rows)
        );
        sendRecords(response, inserted, 201);
      }
    );
  }

  route('export-xls', 'post', '/export-xls', async (request, response) => {
    const session = resolvedSession(response);
    const query = parseListQuery(request.query, contract, {
      default: exportRowLimit,
      max: exportRowLimit,
    });
    const rows = await runInTenant(cellDb, session, tx =>
      exportRecords(tx[repository], contract, query)
    );
    if (!z.array(contract.itemSchema).safeParse(rows).success) {
      throw new Error('Exported rows violate their transport contract');
    }
    const bytes = workbookFromRecords(rows, name);
    response.setHeader('Content-Type', xlsxMediaType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${module}-${name}.xlsx"`
    );
    response.setHeader('Cache-Control', 'no-store');
    response.status(200).send(Buffer.from(bytes));
  });

  options.extend?.(spec => {
    if (standardActions.some(action => action === spec.action)) {
      throw new Error(`Extension reuses a standard action: ${spec.action}`);
    }
    if (/:tenant/i.test(spec.path)) {
      throw new Error(`Extension path names a tenant: ${spec.path}`);
    }
    route(spec.action, spec.method, spec.path, async (request, response) => {
      const session = resolvedSession(response);
      const body = parseAt(spec.body, request.body);
      const query = parseAt(spec.query, request.query, 'query');
      const params = parseAt(spec.params, request.params, 'params');
      const value = await runInTenant(cellDb, session, tx =>
        spec.operation(tx, { body, query, params, session })
      );
      sendContract(response, spec.response, value, spec.status ?? 200);
    });
  });

  route('read', 'get', '/:id', async (request, response) => {
    const session = resolvedSession(response);
    const id = parseAt(contract.columnSchema(pk), request.params.id, 'id');
    const row = await runInTenant(cellDb, session, tx =>
      readRecord(tx[repository], String(id))
    );
    sendContract(response, single, { version: transportVersion, data: row });
  });

  return router;
}
