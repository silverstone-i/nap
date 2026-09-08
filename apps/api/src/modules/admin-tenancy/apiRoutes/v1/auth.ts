/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { z } from 'zod';
import {
  authSuccessSchema,
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
    },
  });
}
