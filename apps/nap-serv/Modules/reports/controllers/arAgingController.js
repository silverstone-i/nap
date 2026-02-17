/**
 * @file AR Aging report controller
 * @module reports/controllers/arAgingController
 *
 * Endpoints:
 *   GET /  — all clients AR aging summary
 *   GET /:clientId — single client AR aging detail
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import db from '../../../src/db/db.js';
import ReportController from './reportController.js';

class ArAgingController extends ReportController {
  async getAll(req, res) {
    try {
      const schema = this.getSchema(req);
      const rows = await db.manyOrNone(`SELECT * FROM ${schema}.vw_ar_aging ORDER BY client_name`);
      res.json(rows);
    } catch (err) {
      this.handleError(err, res, 'arAging.getAll');
    }
  }

  async getByClient(req, res) {
    try {
      const schema = this.getSchema(req);
      const { clientId } = req.params;
      const row = await db.oneOrNone(
        `SELECT * FROM ${schema}.vw_ar_aging WHERE client_id = $1`,
        [clientId],
      );
      if (!row) return res.status(404).json({ error: 'Client not found' });
      res.json(row);
    } catch (err) {
      this.handleError(err, res, 'arAging.getByClient');
    }
  }
}

const instance = new ArAgingController();
export default instance;
