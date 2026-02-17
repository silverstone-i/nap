/**
 * @file AP Aging report controller
 * @module reports/controllers/apAgingController
 *
 * Endpoints:
 *   GET /  — all vendors AP aging summary
 *   GET /:vendorId — single vendor AP aging detail
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import db from '../../../src/db/db.js';
import ReportController from './reportController.js';

class ApAgingController extends ReportController {
  async getAll(req, res) {
    try {
      const schema = this.getSchema(req);
      const rows = await db.manyOrNone(`SELECT * FROM ${schema}.vw_ap_aging ORDER BY vendor_name`);
      res.json(rows);
    } catch (err) {
      this.handleError(err, res, 'apAging.getAll');
    }
  }

  async getByVendor(req, res) {
    try {
      const schema = this.getSchema(req);
      const { vendorId } = req.params;
      const row = await db.oneOrNone(
        `SELECT * FROM ${schema}.vw_ap_aging WHERE vendor_id = $1`,
        [vendorId],
      );
      if (!row) return res.status(404).json({ error: 'Vendor not found' });
      res.json(row);
    } catch (err) {
      this.handleError(err, res, 'apAging.getByVendor');
    }
  }
}

const instance = new ApAgingController();
export default instance;
