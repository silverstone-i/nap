import { resolveEnvironment } from '../../../../util/env.js';
import { physicalIdentity } from '../../../cell-tenancy/verifyProvisioning.js';
import { referenceReady } from '../../../reference-data/seed.js';
/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import {
  platformRoleChangeSchema,
  platformAccessSchema,
  accessChangedSchema,
  entitlementChangeSchema,
} from '@nap/shared';
import {
  platformAccessOverview,
  changePlatformRole,
} from '../../../../services/platformAdministration.js';
import { changeEntitlement } from '../../../../services/entitlements.js';
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
import type { CellRegistry } from '../../../../services/cellRegistry.js';
import type { AuthConfiguration } from '../../../../util/authConfig.js';

/** Does: Registers explicit operator commands through the shared factory. Called by: route composition. */
export default function controlRouter(
  db: AdminHandle,
  config: AuthConfiguration,
  cells: CellRegistry
) {
  const empty = z.strictObject({});
  const controller = new ReadController(db, 'tenants');
  return createRouter(controller, {
    module: 'admin-tenancy',
    router: 'control',
    routes: Object.fromEntries(standardActions.map(a => [a, false])),
    extend: add => {
      add({
        action: 'cell-readiness',
        method: 'get',
        path: '/cell-readiness',
        access: 'platform',
        body: z.undefined(),
        query: z.strictObject({ cell: z.uuid() }),
        params: empty,
        response: z.object({
          version: z.literal(1),
          data: z.object({
            cellId: z.uuid(),
            database: z.string(),
            environment: z.enum(['dev', 'test', 'prod']),
            operationId: z.uuid(),
            ready: z.boolean(),
          }),
        }),
        operation: async (tx, input) => {
          await requirePlatform(tx, input.session.actorId, 'cell-readiness');
          const selected = cells.get(input.query.cell.toLowerCase());
          const identity = await physicalIdentity(selected);
          const ready = await referenceReady(selected);
          if (
            identity.id !== input.query.cell.toLowerCase() ||
            identity.actual !== identity.database_name ||
            identity.environment !== resolveEnvironment().toLowerCase()
          )
            throw new HttpError('SERVICE_UNAVAILABLE');
          return {
            version: 1 as const,
            data: {
              cellId: identity.id,
              database: identity.actual,
              environment: identity.environment,
              operationId: identity.operation_id,
              ready,
            },
          };
        },
      });
      add({
        action: 'role-policy',
        method: 'post',
        path: '/role-policy',
        access: 'platform',
        body: platformRoleChangeSchema,
        query: empty,
        params: empty,
        response: accessChangedSchema,
        operation: async (tx, input) => ({
          version: transportVersion,
          data: await changePlatformRole(tx, input.session.actorId, input.body),
        }),
      });
      add({
        action: 'access-overview',
        method: 'get',
        path: '/access-overview',
        access: 'platform',
        body: z.undefined(),
        query: empty,
        params: empty,
        response: platformAccessSchema,
        operation: async (tx, input) => ({
          version: transportVersion,
          data: await platformAccessOverview(tx, input.session.actorId),
        }),
      });

      add({
        action: 'entitlement',
        method: 'post',
        path: '/entitlement',
        access: 'platform',
        body: entitlementChangeSchema,
        query: empty,
        params: empty,
        response: z.object({
          version: z.literal(1),
          data: z.object({ id: z.uuid(), projected: z.boolean() }),
        }),
        operation: async (tx, input) => ({
          version: transportVersion,
          data: await changeEntitlement(
            tx,
            cells,
            input.session.actorId,
            input.body
          ),
        }),
      });

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
              cells,
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
