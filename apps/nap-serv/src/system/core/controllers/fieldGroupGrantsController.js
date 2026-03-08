/**
 * @file Field group grants controller — CRUD + bulk sync for RBAC Layer 4
 * @module core/controllers/fieldGroupGrantsController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';
import db, { pgp } from '../../../db/db.js';
import { invalidateByRole } from '../../../services/permCacheInvalidator.js';

class FieldGroupGrantsController extends BaseController {
  constructor() {
    super('fieldGroupGrants');
  }

  /**
   * PUT /sync-for-role — atomically replace all field group grants for a role.
   * Body: { role_id, grant_ids: [field_group_id, ...] }
   */
  async syncForRole(req, res) {
    try {
      const schema = this.getSchema(req);
      const s = pgp.as.name(schema);
      const { role_id, grant_ids = [] } = req.body;

      if (!role_id) return res.status(400).json({ error: 'role_id is required' });

      const role = await db('roles', schema).findById(role_id);
      if (!role) return res.status(404).json({ error: 'Role not found' });
      if (role.is_immutable) return res.status(403).json({ error: 'Cannot modify field group grants for an immutable role' });

      const userId = req.user?.id ?? null;
      const tenantCode = req.user?.tenant_code ?? null;

      const result = await db.tx(async (t) => {
        await t.none(`DELETE FROM ${s}.field_group_grants WHERE role_id = $1`, [role_id]);

        if (!grant_ids.length) return [];

        const rows = grant_ids.map((fieldGroupId) => ({
          role_id,
          field_group_id: fieldGroupId,
          tenant_code: tenantCode,
          created_by: userId,
        }));

        const cs = new pgp.helpers.ColumnSet(
          ['role_id', 'field_group_id', 'tenant_code', 'created_by'],
          { table: { table: 'field_group_grants', schema } },
        );

        const insert = pgp.helpers.insert(rows, cs) + ' RETURNING *';
        return t.any(insert);
      });

      await invalidateByRole(schema, role.code, tenantCode);

      res.json({ records: result, count: result.length });
    } catch (err) {
      this.handleError(err, res, 'syncing field group grants for', 'role');
    }
  }
}

const instance = new FieldGroupGrantsController();
export default instance;
export { FieldGroupGrantsController };
