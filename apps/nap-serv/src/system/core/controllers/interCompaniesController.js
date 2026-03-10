/**
 * @file Inter-companies controller — auto-creates a sources record on creation
 * @module core/controllers/interCompaniesController
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';
import db, { pgp } from '../../../db/db.js';

class InterCompaniesController extends BaseController {
  constructor() {
    super('interCompanies');
    this.rbacConfig = { module: 'core', router: 'inter-companies' };
  }

  /**
   * POST / — insert inter-company with auto-created sources record.
   */
  async create(req, res) {
    try {
      const schema = this.getSchema(req);
      const s = pgp.as.name(schema);

      if (!req.body.tenant_id && req.user?.tenant_id) {
        req.body.tenant_id = req.user.tenant_id;
      }

      const record = await db.tx(async (t) => {
        const icModel = this.model(schema);
        icModel.tx = t;

        const ic = await icModel.insert(req.body);

        const sourcesModel = db('sources', schema);
        sourcesModel.tx = t;
        const source = await sourcesModel.insert({
          tenant_id: ic.tenant_id,
          table_id: ic.id,
          source_type: 'inter_company',
          label: ic.name,
          created_by: req.body.created_by || null,
        });

        await t.none(
          `UPDATE ${s}.inter_companies SET source_id = $1, updated_by = $2 WHERE id = $3`,
          [source.id, req.body.created_by || null, ic.id],
        );

        return { ...ic, source_id: source.id };
      });

      res.status(201).json(record);
    } catch (err) {
      if (err.name === 'SchemaDefinitionError') err.message = 'Invalid input data';
      this.handleError(err, res, 'creating', this.errorLabel);
    }
  }
}

const instance = new InterCompaniesController();
export default instance;
export { InterCompaniesController };
