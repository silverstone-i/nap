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
import {
  checkRecordColumns,
  parseAt,
  parseRecord,
  withTenant,
} from './recordInput.js';
import {
  requiredSession,
  resolvedSession,
  runOperation,
  tableModel,
} from './runOperation.js';
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
import type { CookieOptions, RequestHandler, Response, Router } from 'express';
import type { ResolvedSession } from '../middleware/session.js';
import type { ModelContract, Repositories, Row } from './modelContract.js';
import type { ReadController } from './ReadController.js';
import type { RepositoryTransaction } from './runOperation.js';

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
 * Does: Represents the two ways an extension route may relax the session
 * gates: anonymous runs with no session at all, authenticated needs a
 * session but no active tenant, entitlement, or permission.
 * Used by: ExtensionRoute and createRouter.
 * Why: the framework HTTP contract admits these two declarations and
 * reserves them for the admin-tenancy authentication router, whose login
 * and logout routes run before a session exists.
 */
export type RouteAccess = 'anonymous' | 'authenticated';

/**
 * Does: Represents the session an extension operation receives for a given
 * access declaration: possibly none for an anonymous route, one without a
 * guaranteed tenant for an authenticated route, and one with its active
 * tenant otherwise.
 * Used by: ExtensionInput.
 */
export type SessionFor<A extends RouteAccess | undefined> =
  A extends 'anonymous'
    ? ResolvedSession | undefined
    : A extends 'authenticated'
      ? ResolvedSession
      : ResolvedSession & { readonly tenantId: string };

/**
 * Does: Lets an extension operation set or clear a cookie on the response
 * it will produce.
 * Used by: ExtensionInput, and the login and logout operations of the
 * authentication router.
 * Why: the cookie is applied only after the operation returns and its
 * result passes the response contract, so a refusal that rolls the
 * transaction back, or a contract violation, leaves no cookie behind.
 */
export type ReplyControls = {
  readonly setCookie: (
    name: string,
    value: string,
    options?: CookieOptions
  ) => void;
  readonly clearCookie: (name: string, options?: CookieOptions) => void;
};

/**
 * Does: Represents the checked inputs an extension operation receives: its
 * body, query, and route parameters, each validated by the route's own
 * schema, the session its access declaration allows, the client's network
 * address, and the cookie controls for its reply.
 * Used by: ExtensionRoute operations.
 * Why: the client address is the socket address unless the app trusts a
 * number of proxy hops, so a caller cannot choose the address the
 * authentication router throttles against.
 */
export type ExtensionInput<
  B,
  Q,
  P,
  A extends RouteAccess | undefined = undefined,
> = {
  readonly body: B;
  readonly query: Q;
  readonly params: P;
  readonly session: SessionFor<A>;
  readonly clientAddress: string | undefined;
  readonly reply: ReplyControls;
};

/**
 * Does: Describes one operation a module adds beyond the standard set: its
 * action name, method and path, the schemas of its inputs and response, an
 * optional access declaration, and the operation run inside the router's
 * transaction.
 * Used by: the extend callback of createRouter.
 * Why: the schemas are required so an extension is validated like a standard
 * route (framework HTTP contract); a route without a body declares
 * z.undefined(), and one without query or route parameters declares an
 * empty strict object. Access may be declared only on the admin-tenancy
 * authentication router; createRouter refuses it anywhere else.
 */
export type ExtensionRoute<
  R,
  B,
  Q,
  P,
  A extends RouteAccess | undefined = undefined,
> = {
  readonly action: string;
  readonly method: RouteMethod;
  readonly path: string;
  readonly access?: A;
  readonly body: z.ZodType<B>;
  readonly query: z.ZodType<Q>;
  readonly params: z.ZodType<P>;
  readonly response: z.ZodType;
  readonly status?: number;
  readonly operation: (
    tx: RepositoryTransaction<R>,
    input: ExtensionInput<B, Q, P, A>
  ) => Promise<unknown>;
};

/**
 * Does: Represents what a module passes to createRouter beside its
 * controller: the module and router names, which standard routes to leave
 * unregistered, and a callback that adds extension routes.
 * Used by: createRouter and every module router file.
 * Why: R is the repository set of the controller's pool, so an extension
 * operation is typed against the module's own repositories.
 */
export type RouterOptions<R> = {
  readonly module: string;
  readonly router: string;
  readonly routes?: Partial<Record<StandardAction, boolean>>;
  readonly extend?: (
    add: <B, Q, P, A extends RouteAccess | undefined = undefined>(
      route: ExtensionRoute<R, B, Q, P, A>
    ) => void
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
 * Does: Returns true when a router is the one the framework HTTP contract
 * lets declare route access: the authentication router of admin-tenancy,
 * bound to the admin pool.
 * Called by: createRouter when an extension declares access.
 * Why: an anonymous route has no session and an authenticated one no
 * guaranteed tenant, so neither can open a tenant transaction; only an
 * admin-bound router can run them.
 */
function mayDeclareAccess(
  module: string,
  router: string,
  target: 'cell' | 'admin'
) {
  return module === 'admin-tenancy' && router === 'auth' && target === 'admin';
}

/**
 * Does: Collects the cookies an extension operation asks for and applies
 * them to the response once the operation has succeeded.
 * Called by: the extension handler, once per request.
 */
function collectReply() {
  const pending: ((response: Response) => void)[] = [];
  const controls: ReplyControls = {
    setCookie: (name, value, options) =>
      pending.push(response => response.cookie(name, value, options ?? {})),
    clearCookie: (name, options) =>
      pending.push(response => response.clearCookie(name, options ?? {})),
  };
  return {
    controls,
    /** Does: Writes every collected cookie onto the response. */
    apply(response: Response) {
      for (const write of pending) write(response);
    },
  };
}

/**
 * Does: Builds the Express router for a controller: the standard route set,
 * any extension routes, each behind the gate chain its access allows,
 * validation, one transaction on the controller's database, and the
 * response-contract check.
 * Called by: a module's router file, once per router, from its exported
 * factory; and by framework tests.
 * Why: this is the one HTTP surface every module presents (ARCH-050). Static
 * paths register before the parameterized read route so none is shadowed. A
 * route disabled through the routes option is never registered, so it
 * answers exactly as an unknown path. Write routes exist only for a
 * WriteController, and archive and restore only for a soft-deleting model.
 * A controller's rbacConfig, when set, must agree with the options. A
 * cell-bound router stamps the active tenant on every inserted row and runs
 * inside a tenant transaction; an admin-bound router does neither (framework
 * HTTP contract).
 * @throws At construction on a defective model, a disagreeing rbacConfig,
 * an extension that reuses an action or a method and path, or an access
 * declaration on any router but the admin-tenancy authentication router.
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
  const { binding, repository } = controller;
  const contract = describeModel(binding, repository, controller.itemSchema);
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
   * Does: Registers one route behind the gates its access needs unless it
   * is disabled, after checking its action and path are unused.
   */
  function route(
    action: string,
    method: RouteMethod,
    path: string,
    access: RouteAccess | 'full',
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
    const gates: RequestHandler[] =
      access === 'anonymous'
        ? []
        : access === 'authenticated'
          ? [requireSession]
          : [
              requireSession,
              requireTenant,
              requireEntitlement(module),
              requirePermission(`${module}::${name}::${action}`),
            ];
    router[method](path, label, ...gates, rejectTenantInput, ...handlers);
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
   * Does: Returns a record with the active tenant written in for a
   * cell-bound router, and unchanged for an admin-bound one.
   */
  function stamped(row: Row, tenantId: string) {
    return binding.target === 'cell' ? withTenant(row, tenantId) : row;
  }

  /**
   * Does: Checks and prepares records for insertion: each must be an object
   * of writable columns, receives the active tenant on a cell-bound router,
   * and passes the model's insert validator.
   */
  function insertable(
    records: unknown[],
    tenantId: string,
    insertSchema: z.ZodType,
    prefix: string
  ) {
    return records.map((record, index) => {
      const path = `${prefix}.${index}`;
      const row = stamped(
        checkRecordColumns(record, path, contract, 'insert'),
        tenantId
      );
      return parseRecord(insertSchema, row, path);
    });
  }

  route('list', 'get', '/', 'full', async (request, response) => {
    const session = resolvedSession(response);
    const query = parseListQuery(request.query, contract, listPageSize);
    const result = await runOperation(binding, session, tx =>
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

    route('create', 'post', '/', 'full', async (request, response) => {
      const session = resolvedSession(response);
      const row = stamped(
        checkRecordColumns(request.body, '', contract, 'insert'),
        session.tenantId
      );
      const record = parseRecord(insertSchema, row);
      const created = await runOperation(binding, session, tx =>
        createRecord(tableModel(tx, repository), record)
      );
      sendContract(
        response,
        single,
        { version: transportVersion, data: created },
        201
      );
    });

    route(
      'bulk-insert',
      'post',
      '/bulk-insert',
      'full',
      async (request, response) => {
        const session = resolvedSession(response);
        const body = parseAt(bulkInsertBodySchema(genericRecord), request.body);
        const rows = insertable(
          body.records,
          session.tenantId,
          insertSchema,
          'records'
        );
        const inserted = await runOperation(binding, session, tx =>
          bulkInsertRecords(tableModel(tx, repository), contract, rows)
        );
        sendRecords(response, inserted, 201);
      }
    );

    route('update', 'put', '/update', 'full', async (request, response) => {
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
      const parsed = parseRecord(updateSchema, changes, 'changes');
      const rows = await runOperation(binding, session, tx =>
        updateRecords(
          tableModel(tx, repository),
          contract,
          { ids: body.ids, path: index => `ids.${index}` },
          parsed
        )
      );
      sendRecords(response, rows);
    });

    route(
      'bulk-update',
      'put',
      '/bulk-update',
      'full',
      async (request, response) => {
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
            throw new HttpError(
              'INVALID_INPUT',
              fieldError(path, 'No changes')
            );
          }
          const parsed = parseRecord(updateSchema, checked, path);
          ids.push(id);
          records.push({ ...parsed, [pk]: id });
        }
        const rows = await runOperation(binding, session, tx =>
          bulkUpdateRecords(
            tableModel(tx, repository),
            contract,
            { ids, path: index => `records.${index}.${pk}` },
            records
          )
        );
        sendRecords(response, rows);
      }
    );

    if (contract.softDelete) {
      route(
        'archive',
        'delete',
        '/archive',
        'full',
        async (request, response) => {
          const session = resolvedSession(response);
          const { ids } = parseAt(idsBodySchema, request.body);
          const rows = await runOperation(binding, session, tx =>
            archiveRecords(tableModel(tx, repository), contract, {
              ids,
              path: index => `ids.${index}`,
            })
          );
          sendRecords(response, rows);
        }
      );

      route(
        'restore',
        'patch',
        '/restore',
        'full',
        async (request, response) => {
          const session = resolvedSession(response);
          const { ids } = parseAt(idsBodySchema, request.body);
          const rows = await runOperation(binding, session, tx =>
            restoreRecords(tableModel(tx, repository), contract, {
              ids,
              path: index => `ids.${index}`,
            })
          );
          sendRecords(response, rows);
        }
      );
    } else if (routes.archive === true || routes.restore === true) {
      throw new Error(`Model does not soft-delete: ${repository}`);
    }

    route(
      'import-xls',
      'post',
      '/import-xls',
      'full',
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
        const inserted = await runOperation(binding, session, tx =>
          bulkInsertRecords(tableModel(tx, repository), contract, rows)
        );
        sendRecords(response, inserted, 201);
      }
    );
  }

  route(
    'export-xls',
    'post',
    '/export-xls',
    'full',
    async (request, response) => {
      const session = resolvedSession(response);
      const query = parseListQuery(request.query, contract, {
        default: exportRowLimit,
        max: exportRowLimit,
      });
      const rows = await runOperation(binding, session, tx =>
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
    }
  );

  options.extend?.(
    <B, Q, P, A extends RouteAccess | undefined>(
      spec: ExtensionRoute<R, B, Q, P, A>
    ) => {
      if (standardActions.some(action => action === spec.action)) {
        throw new Error(`Extension reuses a standard action: ${spec.action}`);
      }
      if (/:tenant/i.test(spec.path)) {
        throw new Error(`Extension path names a tenant: ${spec.path}`);
      }
      const access = spec.access;
      if (
        access !== undefined &&
        !mayDeclareAccess(module, name, binding.target)
      ) {
        throw new Error(
          `Route access may be declared only by the admin-bound admin-tenancy auth router: ${spec.action}`
        );
      }
      route(
        spec.action,
        spec.method,
        spec.path,
        access ?? 'full',
        async (request, response) => {
          // Each access mode is narrowed by its gates before this runs; the
          // cast records the session shape the operation was declared for.
          const session = (access === 'anonymous'
            ? response.locals.session
            : access === 'authenticated'
              ? requiredSession(response)
              : resolvedSession(response)) as unknown as SessionFor<A>;
          const body = parseAt(spec.body, request.body);
          const query = parseAt(spec.query, request.query, 'query');
          const params = parseAt(spec.params, request.params, 'params');
          const reply = collectReply();
          const value = await runOperation(binding, session, tx =>
            spec.operation(tx, {
              body,
              query,
              params,
              session,
              clientAddress: request.ip,
              reply: reply.controls,
            })
          );
          // Check the contract before any cookie is written, so a violation
          // answers as a generic failure with no cookie attached.
          if (!spec.response.safeParse(value).success) {
            throw new Error('Response body violates its transport contract');
          }
          reply.apply(response);
          sendContract(response, spec.response, value, spec.status ?? 200);
        }
      );
    }
  );

  route('read', 'get', '/:id', 'full', async (request, response) => {
    const session = resolvedSession(response);
    const id = parseAt(contract.columnSchema(pk), request.params.id, 'id');
    const row = await runOperation(binding, session, tx =>
      readRecord(tx[repository], String(id))
    );
    sendContract(response, single, { version: transportVersion, data: row });
  });

  return router;
}
