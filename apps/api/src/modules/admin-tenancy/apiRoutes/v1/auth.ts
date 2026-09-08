/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
  memberships,
  selectTenant,
  startAccess,
  endAccess,
} from '../../../../services/tenantSelection.js';
import {
  cookieOptions,
  sessionCookieName,
} from '../../../../util/sessionCookie.js';
import { z } from 'zod';
import {
  authSuccessSchema,
  membershipsResponseSchema,
  selectionBodySchema,
  accessBodySchema,
  loginBodySchema,
  passwordBodySchema,
  sessionResponseSchema,
  transportVersion,
} from '@nap/shared';
import {
  createRouter,
  standardActions,
} from '../../../../framework/createRouter.js';
import { AuthController } from '../../controllers/AuthController.js';
import { loginOperation, logout, changePassword } from '../../domain/auth.js';
import type { AdminHandle } from '../../../../db/admin/repositories.js';
import type { AuthConfiguration } from '../../../../util/authConfig.js';

/**
 * Does: Builds the four contract-checked authentication endpoints through the shared router.
 * Called by: the route registry during application construction.
 */
export default function authRouter(db: AdminHandle, config: AuthConfiguration) {
  const empty = z.strictObject({});
  const login = loginOperation(config);
  return createRouter(new AuthController(db), {
    module: 'admin-tenancy',
    router: 'auth',
    routes: Object.fromEntries(standardActions.map(action => [action, false])),
    extend: add => {
      add({
        action: 'login',
        method: 'post',
        path: '/login',
        access: 'anonymous',
        body: loginBodySchema,
        query: empty,
        params: empty,
        response: sessionResponseSchema,
        operation: login,
      });
      add({
        action: 'logout',
        method: 'post',
        path: '/logout',
        access: 'anonymous',
        body: z.undefined(),
        query: empty,
        params: empty,
        response: authSuccessSchema,
        operation: (tx, input) => logout(tx, input, config),
      });
      add({
        action: 'session',
        method: 'get',
        path: '/session',
        access: 'authenticated',
        body: z.undefined(),
        query: empty,
        params: empty,
        response: sessionResponseSchema,
        operation: (_tx, input) =>
          Promise.resolve({
            version: transportVersion,
            data: input.session.view,
          }),
      });
      add({
        action: 'password',
        method: 'put',
        path: '/password',
        access: 'authenticated',
        body: passwordBodySchema,
        query: empty,
        params: empty,
        response: authSuccessSchema,
        operation: (tx, input) => changePassword(tx, input, config),
      });
      add({
        action: 'memberships',
        method: 'get',
        path: '/memberships',
        access: 'authenticated',
        body: z.undefined(),
        query: empty,
        params: empty,
        response: membershipsResponseSchema,
        operation: async (tx, input) => ({
          version: transportVersion,
          data: await memberships(tx, input.session),
        }),
      });
      add({
        action: 'select',
        method: 'post',
        path: '/select',
        access: 'authenticated',
        body: selectionBodySchema,
        query: empty,
        params: empty,
        response: authSuccessSchema,
        operation: async (tx, input) => {
          const cookie = await selectTenant(
            tx,
            input.session,
            input.body.membership,
            config
          );
          input.reply.setCookie(
            sessionCookieName,
            cookie,
            cookieOptions(config)
          );
          return { version: transportVersion, data: null };
        },
      });
      add({
        action: 'access',
        method: 'post',
        path: '/access',
        access: 'authenticated',
        body: accessBodySchema,
        query: empty,
        params: empty,
        response: authSuccessSchema,
        operation: async (tx, input) => {
          const cookie = await startAccess(
            tx,
            input.session,
            input.body,
            config
          );
          input.reply.setCookie(
            sessionCookieName,
            cookie,
            cookieOptions(config)
          );
          return { version: transportVersion, data: null };
        },
      });
      add({
        action: 'end-access',
        method: 'post',
        path: '/end-access',
        access: 'authenticated',
        body: z.undefined(),
        query: empty,
        params: empty,
        response: authSuccessSchema,
        operation: async (tx, input) => {
          const cookie = await endAccess(tx, input.session, config);
          input.reply.setCookie(
            sessionCookieName,
            cookie,
            cookieOptions(config)
          );
          return { version: transportVersion, data: null };
        },
      });
    },
  });
}
