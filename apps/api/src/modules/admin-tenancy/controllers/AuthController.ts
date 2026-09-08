/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { ReadController } from '../../../framework/ReadController.js';
import type {
  AdminHandle,
  AdminRepositories,
} from '../../../db/admin/repositories.js';

/**
 * Does: Binds authentication routes to the admin identity repository.
 * Called by: the authentication router factory.
 */
export class AuthController extends ReadController<
  'portal_users',
  AdminRepositories
> {
  /**
   * Does: Supplies the admin pool and authentication permission scope.
   * Called by: the auth router factory.
   */
  constructor(db: AdminHandle) {
    super(db, 'portal_users');
    this.rbacConfig = { module: 'admin-tenancy', router: 'auth' };
  }
}
