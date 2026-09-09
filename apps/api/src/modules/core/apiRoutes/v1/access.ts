/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { z } from 'zod';
import {
  accessOverviewSchema,
  accessChangeSchema,
  accessChangedSchema,
  effectiveAccessSchema,
  transportVersion,
} from '@nap/shared';
import {
  createRouter,
  standardActions,
} from '../../../../framework/createRouter.js';
import { ReadController } from '../../../../framework/ReadController.js';
import {
  accessOverview,
  changeAccess,
  effectiveAccess,
} from '../../../../services/accessAdministration.js';
import type { CellHandle } from '../../../../db/cell/repositories.js';
/** Does: Registers tenant access administration. Called by: route composition. */
export default function accessRouter(db: CellHandle) {
  return createRouter(new ReadController(db, 'roles'), {
    module: 'core',
    router: 'access',
    routes: Object.fromEntries(standardActions.map(a => [a, false])),
    extend: add => {
      const empty = z.strictObject({});
      add({
        action: 'overview',
        method: 'get',
        path: '/overview',
        body: z.undefined(),
        query: empty,
        params: empty,
        response: accessOverviewSchema,
        operation: async (tx, input) => ({
          version: transportVersion,
          data: await accessOverview(tx, input.session),
        }),
      });
      add({
        action: 'change',
        method: 'post',
        path: '/change',
        body: accessChangeSchema,
        query: empty,
        params: empty,
        response: accessChangedSchema,
        operation: async (tx, input) => ({
          version: transportVersion,
          data: await changeAccess(tx, input.session, input.body),
        }),
      });
      add({
        action: 'effective',
        method: 'get',
        path: '/effective',
        body: z.undefined(),
        query: z.strictObject({ binding: z.uuid() }),
        params: empty,
        response: effectiveAccessSchema,
        operation: async (tx, input) => ({
          version: transportVersion,
          data: await effectiveAccess(tx, input.session, input.query.binding),
        }),
      });
    },
  });
}
