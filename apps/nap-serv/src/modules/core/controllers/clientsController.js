/**
 * @file Clients controller — auto-creates a sources record on client creation
 * @module core/controllers/clientsController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';
import db from '../../../db/db.js';

class ClientsController extends BaseController {
  constructor() {
    super('clients');
  }

  /**
   * POST / — insert a client and auto-create a linked sources record.
   * Runs inside a transaction so both inserts succeed or both roll back.
   */
  async create(req, res) {
    try {
      const schema = this.getSchema(req);

      // Inject tenant_id from authenticated session
      if (!req.body.tenant_id && req.user?.tenant_id) {
        req.body.tenant_id = req.user.tenant_id;
      }

      const record = await db.tx(async (t) => {
        const clientsModel = this.model(schema);
        clientsModel.tx = t;

        // 1. Insert the client
        const client = await clientsModel.insert(req.body);

        // 2. Auto-create a sources record linking to this client
        const sourcesModel = db('sources', schema);
        sourcesModel.tx = t;
        const source = await sourcesModel.insert({
          tenant_id: client.tenant_id,
          table_id: client.id,
          source_type: 'client',
          label: client.name,
          created_by: req.body.created_by || null,
        });

        // 3. Link the source back to the client
        await t.none(
          `UPDATE ${schema}.clients SET source_id = $1, updated_by = $2 WHERE id = $3`,
          [source.id, req.body.created_by || null, client.id],
        );

        return { ...client, source_id: source.id };
      });

      res.status(201).json(record);
    } catch (err) {
      if (err.name === 'SchemaDefinitionError') err.message = 'Invalid input data';
      this.handleError(err, res, 'creating', this.errorLabel);
    }
  }
}

const instance = new ClientsController();
export default instance;
export { ClientsController };
