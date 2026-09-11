/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { z } from 'zod';
import {
  identityResponseSchema,
  navigationResponseSchema,
  transportVersion,
} from '@nap/shared';
import {
  createRouter,
  standardActions,
} from '../../../../framework/createRouter.js';
import { ReadController } from '../../../../framework/ReadController.js';
import { HttpError } from '../../../../util/httpError.js';
import type { CellHandle } from '../../../../db/cell/repositories.js';

/** Does: Reads a linked record within the resolved tenant transaction. Called by: route composition. */
export default function identityRouter(db: CellHandle) {
  return createRouter(new ReadController(db, 'employees'), {
    module: 'core',
    router: 'identity',
    routes: Object.fromEntries(standardActions.map(a => [a, false])),
    extend: add => {
      add({
        action: 'navigation',
        method: 'get',
        path: '/navigation',
        body: z.undefined(),
        params: z.strictObject({}),
        query: z.strictObject({}),
        response: navigationResponseSchema,
        operation: (_tx, input) =>
          Promise.resolve({
            version: transportVersion,
            data: {
              employees:
                input.session.permissions.has('core::identity::profile') &&
                (input.session.userType === 'employee' ||
                  input.session.view?.controlledAccess?.mode === 'access'),
            },
          }),
      });
      add({
        action: 'profile',
        method: 'get',
        path: '/profile',
        body: z.undefined(),
        params: z.strictObject({}),
        query: z.strictObject({
          record: z.uuid().optional(),
          kind: z.enum(['employee', 'client', 'vendor']).optional(),
        }),
        response: identityResponseSchema,
        operation: async (tx, input) => {
          const controlled =
            input.session.view?.controlledAccess?.mode === 'access';
          const id = controlled ? input.query.record : input.session.entityId;
          const kind = controlled ? input.query.kind : input.session.userType;
          if (
            !id ||
            !kind ||
            (!controlled && (input.query.record || input.query.kind))
          )
            throw new HttpError('FORBIDDEN');
          const repository =
            kind === 'employee'
              ? tx.employees
              : kind === 'client'
                ? tx.clients
                : tx.vendor_contacts;
          const row = await repository.findById(id);
          if (!row) throw new HttpError('NOT_FOUND');
          return {
            version: transportVersion,
            data: {
              id: row.id,
              name: row.name,
              email: row.email,
              code: row.code,
            },
          };
        },
      });
    },
  });
}
