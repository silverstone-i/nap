/**
 * @file Role Members controller — CRUD + sync for tenant-scope role membership
 * @module core/controllers/roleMembersController
 *
 * Custom endpoints:
 * - PUT /sync — replace all members for a role in one operation
 * - DELETE /remove — hard-delete a single membership row
 *
 * All mutations invalidate affected users' cached permission canons.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';
import db from '../../../db/db.js';
import { invalidateUserPermissions } from '../../../utils/rbacCacheInvalidation.js';

class RoleMembersController extends BaseController {
  constructor() {
    super('roleMembers');
  }

  /**
   * POST / — add a user to a role.
   * After insert, invalidates the user's cached permissions.
   */
  async create(req, res) {
    try {
      const schema = this.getSchema(req);
      const record = await this.model(schema).insert(req.body);
      await invalidateUserPermissions(record.user_id, schema);
      res.status(201).json(record);
    } catch (err) {
      if (err.name === 'SchemaDefinitionError') err.message = 'Invalid input data';
      this.handleError(err, res, 'creating', this.errorLabel);
    }
  }

  /**
   * PUT /sync — replace all members for a role.
   * Accepts { role_id, user_ids: string[] }.
   * Deletes existing members and inserts new ones in a transaction.
   * Invalidates cache for all affected users (old + new).
   */
  async sync(req, res) {
    const { role_id, user_ids } = req.body;

    if (!role_id || !Array.isArray(user_ids)) {
      return res.status(400).json({ error: 'role_id and user_ids[] are required' });
    }

    try {
      const schema = this.getSchema(req);

      // Collect existing members for cache invalidation
      const existing = await this.model(schema).findWhere(
        [{ role_id }],
        'AND',
        { columnWhitelist: ['user_id'] },
      );
      const oldUserIds = existing.map((m) => m.user_id);

      await db.tx(async (t) => {
        // Delete all existing members for this role
        await t.none(`DELETE FROM ${schema}.role_members WHERE role_id = $1`, [role_id]);

        // Insert new members
        if (user_ids.length > 0) {
          const model = this.model(schema);
          model.tx = t;
          for (const user_id of user_ids) {
            await model.insert({
              role_id,
              user_id,
              is_primary: false,
              tenant_code: req.user?.tenant_code || null,
              created_by: req.user?.id || null,
              updated_by: req.user?.id || null,
            });
          }
        }
      });

      // Invalidate cache for all affected users (union of old + new)
      const allUserIds = [...new Set([...oldUserIds, ...user_ids])];
      for (const uid of allUserIds) {
        await invalidateUserPermissions(uid, schema);
      }

      res.json({ message: 'Role members synced', count: user_ids.length });
    } catch (err) {
      this.handleError(err, res, 'syncing members for', this.errorLabel);
    }
  }

  /**
   * DELETE /remove — hard-delete a single role_member row.
   * Accepts query params: role_id, user_id.
   * Invalidates the removed user's cached permissions.
   */
  async remove(req, res) {
    const { role_id, user_id } = req.query;

    if (!role_id || !user_id) {
      return res.status(400).json({ error: 'role_id and user_id query params are required' });
    }

    try {
      const schema = this.getSchema(req);
      const result = await db.result(
        `DELETE FROM ${schema}.role_members WHERE role_id = $1 AND user_id = $2`,
        [role_id, user_id],
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Role member not found' });
      }

      await invalidateUserPermissions(user_id, schema);
      res.json({ message: 'Role member removed' });
    } catch (err) {
      this.handleError(err, res, 'removing member from', this.errorLabel);
    }
  }
}

const instance = new RoleMembersController();
export default instance;
export { RoleMembersController };
