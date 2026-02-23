/**
 * @file Margin Analysis report controller
 * @module reports/controllers/marginAnalysisController
 *
 * Endpoints:
 *   GET / — all projects sorted by margin (configurable sort via query param)
 *
 * Whitelisted sort columns prevent SQL injection.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import db from '../../../src/db/db.js';
import ReportController from './reportController.js';

const SORT_WHITELIST = new Set([
  'project_code',
  'project_name',
  'invoiced_revenue',
  'committed_cost',
  'gross_profit',
  'gross_margin_pct',
  'net_cashflow',
  'budget_variance',
  'est_cost_at_completion',
  'actual_spend',
  'total_budgeted_cost',
  'contract_amount',
]);

class MarginAnalysisController extends ReportController {
  async getAll(req, res) {
    try {
      const schema = this.getSchema(req);
      const sortBy = req.query.sortBy || 'gross_margin_pct';
      const sortDir = req.query.sortDir?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      if (!SORT_WHITELIST.has(sortBy)) {
        return res.status(400).json({ error: `Invalid sort column: ${sortBy}` });
      }

      const rows = await db.manyOrNone(
        `SELECT * FROM ${schema}.vw_project_profitability ORDER BY ${sortBy} ${sortDir}`,
      );
      res.json(rows);
    } catch (err) {
      this.handleError(err, res, 'marginAnalysis.getAll');
    }
  }
}

const instance = new MarginAnalysisController();
export default instance;
