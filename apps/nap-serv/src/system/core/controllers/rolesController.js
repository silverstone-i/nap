/**
 * @file Roles controller — CRUD with guards for system and immutable roles
 * @module core/controllers/rolesController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';
import { invalidateByRole } from '../../../services/permCacheInvalidator.js';

class RolesController extends BaseController {
  constructor() {
    super('roles');
  }

  /** @override — prevent modifying immutable roles, flush permission cache */
  async update(req, res) {
    let roleCode;
    let schema;
    try {
      schema = this.getSchema(req);
      const id = req.query.id;
      if (id) {
        const existing = await this.model(schema).findById(id);
        if (existing?.is_immutable) {
          return res.status(403).json({ error: 'Cannot modify an immutable role' });
        }
        roleCode = existing?.code;
      }
    } catch (err) {
      return this.handleError(err, res, 'validating', 'role');
    }
    const result = await super.update(req, res);
    if (roleCode) await invalidateByRole(schema, roleCode, req.user?.tenant_code);
    return result;
  }

  /** @override — prevent archiving system or immutable roles, flush permission cache */
  async archive(req, res) {
    let roleCode;
    let schema;
    try {
      schema = this.getSchema(req);
      const id = req.query.id;
      if (id) {
        const existing = await this.model(schema).findById(id);
        if (existing?.is_system) {
          return res.status(403).json({ error: 'Cannot archive a system role' });
        }
        if (existing?.is_immutable) {
          return res.status(403).json({ error: 'Cannot archive an immutable role' });
        }
        roleCode = existing?.code;
      }
    } catch (err) {
      return this.handleError(err, res, 'validating', 'role');
    }
    const result = await super.archive(req, res);
    if (roleCode) await invalidateByRole(schema, roleCode, req.user?.tenant_code);
    return result;
  }
}

const instance = new RolesController();
export default instance;
export { RolesController };
