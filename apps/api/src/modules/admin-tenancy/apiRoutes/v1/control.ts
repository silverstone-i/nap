/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { z } from 'zod';
import {
  controlBodySchema,
  controlResponseSchema,
  auditResponseSchema,
  controlCommandResponseSchema,
  transportVersion,
} from '@nap/shared';
import {
  createRouter,
  standardActions,
} from '../../../../framework/createRouter.js';
import { ReadController } from '../../../../framework/ReadController.js';
import {
  controlOverview,
  controlCommand,
  commandPermission,
} from '../../../../services/controlPlane.js';
import { requirePlatform } from '../../../../services/platform.js';
import { HttpError } from '../../../../util/httpError.js';
import type { AdminHandle } from '../../../../db/admin/repositories.js';
import type { CellHandle } from '../../../../db/cell/repositories.js';
import type { AuthConfiguration } from '../../../../util/authConfig.js';

/** Does: Registers explicit operator commands through the shared factory. Called by: route composition. */
export default function controlRouter(
  db: AdminHandle,
  config: AuthConfiguration,
  cell: CellHandle
) {
  const empty = z.strictObject({});
  const controller = new ReadController(db, 'tenants');
  return createRouter(controller, {
    module: 'admin-tenancy',
    router: 'control',
    routes: Object.fromEntries(standardActions.map(a => [a, false])),
    extend: add => {
      // One command endpoint per permission keeps route middleware authoritative.
      for (const action of [
        'registry',
        'provision',
        'members',
        'grants',
      ] as const) {
        add({
          action,
          method: 'post',
          path: `/${action}`,
          access: 'platform',
          body: controlBodySchema,
          query: empty,
          params: empty,
          response: controlCommandResponseSchema,
          operation: async (tx, input) => {
            if (commandPermission(input.body) !== action)
              throw new HttpError('FORBIDDEN');
            const jobId = await controlCommand(
              tx,
              cell,
              input.session.operatorId ?? input.session.actorId,
              input.body,
              config
            );
            return {
              version: transportVersion,
              data: { jobId: jobId ?? null },
            };
          },
        });
      }
      add({
        action: 'audit',
        method: 'get',
        path: '/audit',
        access: 'platform',
        body: z.undefined(),
        query: empty,
        params: empty,
        response: auditResponseSchema,
        operation: async (tx, input) => {
          await requirePlatform(
            tx,
            input.session.operatorId ?? input.session.actorId,
            'audit'
          );
          return {
            version: transportVersion,
            data: (await tx.managed_events.findWhere({}))
              .slice(-200)
              .map(
                ({
                  id,
                  operator_id,
                  effective_user_id,
                  target_id,
                  event,
                  reason,
                  created_at,
                }) => ({
                  id,
                  operator_id,
                  effective_user_id,
                  target_id,
                  event,
                  reason,
                  created_at: created_at.toISOString(),
                })
              ),
          };
        },
      });
      add({
        action: 'overview',
        method: 'get',
        path: '/overview',
        access: 'platform',
        body: z.undefined(),
        query: empty,
        params: empty,
        response: controlResponseSchema,
        operation: async (tx, input) => {
          await requirePlatform(
            tx,
            input.session.operatorId ?? input.session.actorId,
            'overview'
          );
          return { version: transportVersion, data: await controlOverview(tx) };
        },
      });
    },
  });
}
