/**
 * @file Vendors controller — auto-creates a sources record on vendor creation
 * @module core/controllers/vendorsController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';
import db from '../../../db/db.js';

class VendorsController extends BaseController {
  constructor() {
    super('vendors');
  }

  /**
   * POST / — insert a vendor and auto-create a linked sources record.
   * Runs inside a transaction so both inserts succeed or both roll back.
   */
  async create(req, res) {
    try {
      const schema = this.getSchema(req);

      const record = await db.tx(async (t) => {
        const vendorsModel = this.model(schema);
        vendorsModel.tx = t;

        // 1. Insert the vendor
        const vendor = await vendorsModel.insert(req.body);

        // 2. Auto-create a sources record linking to this vendor
        const sourcesModel = db('sources', schema);
        sourcesModel.tx = t;
        const source = await sourcesModel.insert({
          tenant_id: vendor.tenant_id,
          table_id: vendor.id,
          source_type: 'vendor',
          label: vendor.name,
          created_by: req.body.created_by || null,
        });

        // 3. Link the source back to the vendor
        await t.none(
          `UPDATE ${schema}.vendors SET source_id = $1, updated_by = $2 WHERE id = $3`,
          [source.id, req.body.created_by || null, vendor.id],
        );

        return { ...vendor, source_id: source.id };
      });

      res.status(201).json(record);
    } catch (err) {
      if (err.name === 'SchemaDefinitionError') err.message = 'Invalid input data';
      this.handleError(err, res, 'creating', this.errorLabel);
    }
  }
}

const instance = new VendorsController();
export default instance;
export { VendorsController };
