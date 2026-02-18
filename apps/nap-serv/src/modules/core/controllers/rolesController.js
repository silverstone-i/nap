/**
 * @file Roles controller — CRUD for tenant-scope RBAC roles
 * @module core/controllers/rolesController
 *
 * Guards:
 * - Cannot create system or immutable roles via API (seed-only)
 * - Cannot update immutable roles
 * - Cannot archive system roles
 * - Invalidates cached permissions when scope changes
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';
import { invalidateRolePermissions } from '../../../utils/rbacCacheInvalidation.js';

class RolesController extends BaseController {
  constructor() {
    super('roles');
  }

  /**
   * POST / — create a new tenant role.
   * Rejects if is_system or is_immutable is true (only seeds may create those).
   */
  async create(req, res) {
    if (req.body.is_system || req.body.is_immutable) {
      return res.status(400).json({ error: 'Cannot create system or immutable roles via API' });
    }
    return super.create(req, res);
  }

  /**
   * PUT /update — update a role.
   * Rejects if the target role is immutable. Invalidates cached permissions
   * for all members of the role after update (scope changes affect canons).
   */
  async update(req, res) {
    try {
      const schema = this.getSchema(req);
      const id = req.query.id;

      if (id) {
        const existing = await this.model(schema).findById(id);
        if (existing?.is_immutable) {
          return res.status(400).json({ error: 'Cannot modify an immutable role' });
        }
      }

      // Delegate to BaseController.update
      const result = await super.update(req, res);

      // Invalidate cache for all users holding this role
      if (id) {
        await invalidateRolePermissions(id, schema);
      }

      return result;
    } catch (err) {
      this.handleError(err, res, 'updating', this.errorLabel);
    }
  }

  /**
   * DELETE /archive — soft-delete a role.
   * Rejects if the target role is a system role.
   * Invalidates cached permissions for all members after archival.
   */
  async archive(req, res) {
    try {
      const schema = this.getSchema(req);
      const id = req.query.id;

      if (id) {
        const existing = await this.model(schema).findById(id);
        if (existing?.is_system) {
          return res.status(400).json({ error: 'Cannot archive a system role' });
        }
      }

      // Delegate to BaseController.archive
      const result = await super.archive(req, res);

      // Invalidate cache for all users holding this role
      if (id) {
        await invalidateRolePermissions(id, schema);
      }

      return result;
    } catch (err) {
      this.handleError(err, res, 'archiving', this.errorLabel);
    }
  }
}

const instance = new RolesController();
export default instance;
export { RolesController };
