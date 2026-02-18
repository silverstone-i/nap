/**
 * @file Policies controller — CRUD + sync for tenant-scope RBAC policies
 * @module core/controllers/policiesController
 *
 * Custom endpoints:
 * - PUT /sync-for-role — replace all policies for a role in one operation
 *
 * All mutations invalidate affected users' cached permission canons.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';
import db from '../../../db/db.js';
import { invalidateRolePermissions } from '../../../utils/rbacCacheInvalidation.js';

class PoliciesController extends BaseController {
  constructor() {
    super('policies');
  }

  /**
   * PUT /sync-for-role — replace all policies for a given role.
   * Accepts { role_id, policies: [{ module, router, action, level }] }.
   * Deletes existing policies and inserts new ones in a transaction.
   * Invalidates cache for all users holding the role.
   */
  async syncForRole(req, res) {
    const { role_id, policies } = req.body;

    if (!role_id || !Array.isArray(policies)) {
      return res.status(400).json({ error: 'role_id and policies[] are required' });
    }

    try {
      const schema = this.getSchema(req);

      await db.tx(async (t) => {
        // Delete all existing policies for this role
        await t.none(`DELETE FROM ${schema}.policies WHERE role_id = $1`, [role_id]);

        // Insert new policies
        if (policies.length > 0) {
          const model = this.model(schema);
          model.tx = t;
          for (const policy of policies) {
            await model.insert({
              role_id,
              module: policy.module,
              router: policy.router || null,
              action: policy.action || null,
              level: policy.level,
              tenant_code: req.user?.tenant_code || null,
              created_by: req.user?.id || null,
              updated_by: req.user?.id || null,
            });
          }
        }
      });

      // Invalidate cache for all users holding this role
      await invalidateRolePermissions(role_id, schema);

      res.json({ message: 'Policies synced for role', count: policies.length });
    } catch (err) {
      this.handleError(err, res, 'syncing policies for', this.errorLabel);
    }
  }
}

const instance = new PoliciesController();
export default instance;
export { PoliciesController };
