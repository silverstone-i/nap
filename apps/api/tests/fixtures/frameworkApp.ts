/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import express from 'express';
import { correlation } from '../../src/middleware/correlation.js';
import { requestLogging } from '../../src/middleware/requestLogging.js';
import { jsonBody } from '../../src/middleware/jsonBody.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { HttpError } from '../../src/util/httpError.js';
import { createRouter } from '../../src/framework/createRouter.js';
import { ReadController } from '../../src/framework/ReadController.js';
import { WriteController } from '../../src/framework/WriteController.js';
import { withSession } from './testSession.js';
import type { CellDatabase } from '../../src/db/cell/index.js';
import type { RouterOptions } from '../../src/framework/createRouter.js';
import type { ResolvedSession } from '../../src/middleware/session.js';
import type { FrameworkRecords } from './frameworkRecord.js';

/**
 * Does: Names the path the fixture router is mounted at.
 * Used by: the framework tests when they build request paths.
 */
export const recordsPath = '/api/fixture/v1/records';

/**
 * Does: Represents the repositories the fixture cell handle carries.
 * Used by: the framework fixtures and tests.
 */
export type FixtureRepositories = { records: FrameworkRecords };

/**
 * Does: A writable controller over the framework test table, written the
 * way a module's controller is.
 * Used by: createFrameworkApp and the router construction tests.
 */
export class RecordsController extends WriteController<
  'records',
  FixtureRepositories
> {
  constructor(cellDb: CellDatabase<FixtureRepositories>) {
    super(cellDb, 'records');
    this.rbacConfig = { module: 'fixture', router: 'records' };
  }
}

/**
 * Does: A read-only controller over the same table.
 * Used by: the router construction tests and the read-only app tests.
 */
export class RecordsReadController extends ReadController<
  'records',
  FixtureRepositories
> {
  constructor(cellDb: CellDatabase<FixtureRepositories>) {
    super(cellDb, 'records');
    this.rbacConfig = { module: 'fixture', router: 'records' };
  }
}

/**
 * Does: Builds an Express app carrying the production middleware chain, a
 * session stand-in, and the fixture router at its mount path.
 * Called by: the framework integration tests.
 */
export function createFrameworkApp(
  db: CellDatabase<FixtureRepositories>,
  options: {
    session?: ResolvedSession;
    readOnly?: boolean;
    routes?: RouterOptions<FixtureRepositories>['routes'];
    extend?: RouterOptions<FixtureRepositories>['extend'];
  } = {}
) {
  const app = express();
  app.disable('x-powered-by');
  app.use(correlation, requestLogging, jsonBody, withSession(options.session));
  const controller = options.readOnly
    ? new RecordsReadController(db)
    : new RecordsController(db);
  app.use(
    recordsPath,
    createRouter(controller, {
      module: 'fixture',
      router: 'records',
      routes: options.routes,
      extend: options.extend,
    })
  );
  app.use((_request, _response, next) => next(new HttpError('NOT_FOUND')));
  app.use(errorHandler);
  return app;
}
