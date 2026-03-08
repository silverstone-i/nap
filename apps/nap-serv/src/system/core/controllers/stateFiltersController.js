/**
 * @file State filters controller — CRUD + bulk sync for RBAC Layer 3
 * @module core/controllers/stateFiltersController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';
import db, { pgp } from '../../../db/db.js';
import { invalidateByRole } from '../../../services/permCacheInvalidator.js';

class StateFiltersController extends BaseController {
  constructor() {
    super('stateFilters');
  }

  /**
   * PUT /sync-for-role — atomically replace all state filters for a role.
   * Body: { role_id, state_filters: [{ module, router, visible_statuses }] }
   */
  async syncForRole(req, res) {
    try {
      const schema = this.getSchema(req);
      const s = pgp.as.name(schema);
      const { role_id, state_filters = [] } = req.body;

      if (!role_id) return res.status(400).json({ error: 'role_id is required' });

      const role = await db('roles', schema).findById(role_id);
      if (!role) return res.status(404).json({ error: 'Role not found' });
      if (role.is_immutable) return res.status(403).json({ error: 'Cannot modify state filters for an immutable role' });

      const userId = req.user?.id ?? null;
      const tenantCode = req.user?.tenant_code ?? null;

      const result = await db.tx(async (t) => {
        await t.none(`DELETE FROM ${s}.state_filters WHERE role_id = $1`, [role_id]);

        if (!state_filters.length) return [];

        const rows = state_filters.map((f) => ({
          role_id,
          module: f.module,
          router: f.router ?? null,
          visible_statuses: f.visible_statuses,
          tenant_code: tenantCode,
          created_by: userId,
        }));

        const cs = new pgp.helpers.ColumnSet(
          [
            'role_id',
            'module',
            'router',
            { name: 'visible_statuses', cast: 'text[]' },
            'tenant_code',
            'created_by',
          ],
          { table: { table: 'state_filters', schema } },
        );

        const insert = pgp.helpers.insert(rows, cs) + ' RETURNING *';
        return t.any(insert);
      });

      await invalidateByRole(schema, role.code, tenantCode);

      res.json({ records: result, count: result.length });
    } catch (err) {
      this.handleError(err, res, 'syncing state filters for', 'role');
    }
  }
}

const instance = new StateFiltersController();
export default instance;
export { StateFiltersController };
