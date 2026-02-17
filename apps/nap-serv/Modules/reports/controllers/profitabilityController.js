/**
 * @file Profitability report controller
 * @module reports/controllers/profitabilityController
 *
 * Endpoints:
 *   GET /  — all projects profitability summary
 *   GET /:projectId — single project profitability detail
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import db from '../../../src/db/db.js';
import ReportController from './reportController.js';

class ProfitabilityController extends ReportController {
  async getAll(req, res) {
    try {
      const schema = this.getSchema(req);
      const rows = await db.manyOrNone(`SELECT * FROM ${schema}.vw_project_profitability ORDER BY project_code`);
      res.json(rows);
    } catch (err) {
      this.handleError(err, res, 'profitability.getAll');
    }
  }

  async getByProject(req, res) {
    try {
      const schema = this.getSchema(req);
      const { projectId } = req.params;
      const row = await db.oneOrNone(
        `SELECT * FROM ${schema}.vw_project_profitability WHERE project_id = $1`,
        [projectId],
      );
      if (!row) return res.status(404).json({ error: 'Project not found' });
      res.json(row);
    } catch (err) {
      this.handleError(err, res, 'profitability.getByProject');
    }
  }
}

const instance = new ProfitabilityController();
export default instance;
