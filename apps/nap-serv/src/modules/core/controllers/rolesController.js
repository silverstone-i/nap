/**
 * @file Roles controller — CRUD with guards for system and immutable roles
 * @module core/controllers/rolesController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class RolesController extends BaseController {
  constructor() {
    super('roles');
  }

  /** @override — prevent modifying immutable roles */
  async update(req, res) {
    try {
      const schema = this.getSchema(req);
      const id = req.query.id;
      if (id) {
        const existing = await this.model(schema).findById(id);
        if (existing?.is_immutable) {
          return res.status(403).json({ error: 'Cannot modify an immutable role' });
        }
      }
    } catch (err) {
      return this.handleError(err, res, 'validating', 'role');
    }
    return super.update(req, res);
  }

  /** @override — prevent archiving system or immutable roles */
  async archive(req, res) {
    try {
      const schema = this.getSchema(req);
      const id = req.query.id;
      if (id) {
        const existing = await this.model(schema).findById(id);
        if (existing?.is_system) {
          return res.status(403).json({ error: 'Cannot archive a system role' });
        }
        if (existing?.is_immutable) {
          return res.status(403).json({ error: 'Cannot archive an immutable role' });
        }
      }
    } catch (err) {
      return this.handleError(err, res, 'validating', 'role');
    }
    return super.archive(req, res);
  }
}

const instance = new RolesController();
export default instance;
export { RolesController };
