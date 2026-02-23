/**
 * @file Cost Breakdown report controller
 * @module reports/controllers/costBreakdownController
 *
 * Endpoints:
 *   GET /:projectId — cost breakdown by activity category for a project
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import db from '../../../src/db/db.js';
import ReportController from './reportController.js';

class CostBreakdownController extends ReportController {
  async getByProject(req, res) {
    try {
      const schema = this.getSchema(req);
      const { projectId } = req.params;
      const rows = await db.manyOrNone(
        `SELECT * FROM ${schema}.vw_project_cost_by_category WHERE project_id = $1 ORDER BY category_code`,
        [projectId],
      );
      if (!rows.length) return res.status(404).json({ error: 'No cost data for project' });
      res.json(rows);
    } catch (err) {
      this.handleError(err, res, 'costBreakdown.getByProject');
    }
  }
}

const instance = new CostBreakdownController();
export default instance;
