/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { z } from 'zod';
import { projectCompanyOptionsSchema, transportVersion } from '@nap/shared';
import {
  createRouter,
  standardActions,
} from '../../../../framework/createRouter.js';
import { WriteController } from '../../../../framework/WriteController.js';
import {
  projectCompanyOptions,
  resourcePolicy,
} from '../../../../services/authorization.js';
import type { CellHandle } from '../../../../db/cell/repositories.js';
/** Does: Registers scoped projects operations. Called by: route composition. */
export default function projectsRouter(db: CellHandle) {
  return createRouter(new WriteController(db, 'projects'), {
    module: 'projects',
    router: 'projects',
    routes: Object.fromEntries(
      standardActions.map(a => [
        a,
        ['list', 'read', 'create', 'update', 'archive'].includes(a),
      ])
    ),
    extend: add =>
      add({
        action: 'company-options',
        method: 'get',
        path: '/company-options',
        body: z.undefined(),
        query: z.strictObject({}),
        params: z.strictObject({}),
        response: projectCompanyOptionsSchema,
        operation: async (tx, input) => ({
          version: transportVersion,
          data: await projectCompanyOptions(tx, input.session),
        }),
      }),
    authorize: (tx, session, action) =>
      resourcePolicy(tx, session, 'projects::projects', action),
  });
}
