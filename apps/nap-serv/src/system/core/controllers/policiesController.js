/**
 * @file Policies controller — CRUD + bulk sync for role permission grants
 * @module core/controllers/policiesController
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';
import db, { pgp } from '../../../db/db.js';
import { invalidateByRole } from '../../../services/permCacheInvalidator.js';

class PoliciesController extends BaseController {
  constructor() {
    super('policies');
  }

  /**
   * PUT /sync-for-role — atomically replace all policies for a role.
   * Body: { role_id, policies: [{ module, router, action, level }] }
   */
  async syncForRole(req, res) {
    try {
      const schema = this.getSchema(req);
      const s = pgp.as.name(schema);
      const { role_id, policies = [] } = req.body;

      if (!role_id) return res.status(400).json({ error: 'role_id is required' });

      const role = await db('roles', schema).findById(role_id);
      if (!role) return res.status(404).json({ error: 'Role not found' });
      if (role.is_immutable) return res.status(403).json({ error: 'Cannot modify policies for an immutable role' });

      const userId = req.user?.id ?? null;
      const tenantCode = req.user?.tenant_code ?? null;

      const result = await db.tx(async (t) => {
        await t.none(`DELETE FROM ${s}.policies WHERE role_id = $1`, [role_id]);

        if (!policies.length) return [];

        const rows = policies.map((p) => ({
          role_id,
          module: p.module,
          router: p.router ?? null,
          action: p.action ?? null,
          level: p.level,
          tenant_code: tenantCode,
          created_by: userId,
        }));

        const cs = new pgp.helpers.ColumnSet(
          ['role_id', 'module', 'router', 'action', 'level', 'tenant_code', 'created_by'],
          { table: { table: 'policies', schema } },
        );

        const insert = pgp.helpers.insert(rows, cs) + ' RETURNING *';
        return t.any(insert);
      });

      await invalidateByRole(schema, role.code, tenantCode);

      res.json({ records: result, count: result.length });
    } catch (err) {
      this.handleError(err, res, 'syncing policies for', 'role');
    }
  }
}

const instance = new PoliciesController();
export default instance;
export { PoliciesController };
