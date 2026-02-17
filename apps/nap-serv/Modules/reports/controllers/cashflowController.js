/**
 * @file Cashflow report controller
 * @module reports/controllers/cashflowController
 *
 * Endpoints:
 *   GET /project-cashflow/:projectId           — monthly cashflow for a project
 *   GET /project-cashflow/:projectId/forecast   — 6-month forecast based on open invoices + burn rate
 *   GET /company-cashflow                       — company-wide monthly cashflow aggregation
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import db from '../../../src/db/db.js';
import ReportController from './reportController.js';

class CashflowController extends ReportController {
  async getByProject(req, res) {
    try {
      const schema = this.getSchema(req);
      const { projectId } = req.params;
      const rows = await db.manyOrNone(
        `SELECT * FROM ${schema}.vw_project_cashflow_monthly WHERE project_id = $1 ORDER BY month`,
        [projectId],
      );
      if (!rows.length) return res.status(404).json({ error: 'No cashflow data for project' });
      res.json(rows);
    } catch (err) {
      this.handleError(err, res, 'cashflow.getByProject');
    }
  }

  async getForecast(req, res) {
    try {
      const schema = this.getSchema(req);
      const { projectId } = req.params;

      // Expected inflows: sent AR invoices with future due dates
      const expectedInflows = await db.manyOrNone(`
        SELECT
          DATE_TRUNC('month', ai.due_date)::date AS month,
          SUM(ai.balance_due) AS expected_inflow
        FROM ${schema}.ar_invoices ai
        WHERE ai.project_id = $1
          AND ai.status = 'sent'
          AND ai.due_date >= CURRENT_DATE
          AND ai.balance_due > 0
          AND ai.deactivated_at IS NULL
        GROUP BY DATE_TRUNC('month', ai.due_date)
        ORDER BY month
      `, [projectId]);

      // Expected outflows: approved AP invoices with future due dates
      const expectedOutflows = await db.manyOrNone(`
        SELECT
          DATE_TRUNC('month', api.due_date)::date AS month,
          SUM(api.balance_due) AS expected_outflow
        FROM ${schema}.ap_invoices api
        WHERE api.project_id = $1
          AND api.status = 'approved'
          AND api.due_date >= CURRENT_DATE
          AND api.balance_due > 0
          AND api.deactivated_at IS NULL
        GROUP BY DATE_TRUNC('month', api.due_date)
        ORDER BY month
      `, [projectId]);

      // Budget burn rate: 90-day rolling average of actual_costs, projected forward 6 months
      const burnRate = await db.oneOrNone(`
        SELECT
          COALESCE(
            SUM(ac.amount) / NULLIF(
              EXTRACT(DAY FROM (CURRENT_DATE - MIN(ac.incurred_on))), 0
            ) * 30, 0
          ) AS monthly_burn_rate
        FROM ${schema}.actual_costs ac
        WHERE ac.project_id = $1
          AND ac.approval_status = 'approved'
          AND ac.incurred_on >= CURRENT_DATE - INTERVAL '90 days'
          AND ac.deactivated_at IS NULL
      `, [projectId]);

      res.json({
        expected_inflows: expectedInflows,
        expected_outflows: expectedOutflows,
        monthly_burn_rate: Number(burnRate?.monthly_burn_rate ?? 0),
      });
    } catch (err) {
      this.handleError(err, res, 'cashflow.getForecast');
    }
  }

  async getCompanyCashflow(req, res) {
    try {
      const schema = this.getSchema(req);
      const rows = await db.manyOrNone(`
        SELECT
          month,
          SUM(inflow)        AS inflow,
          SUM(outflow)       AS outflow,
          SUM(actual_cost)   AS actual_cost,
          SUM(net_cashflow)  AS net_cashflow
        FROM ${schema}.vw_project_cashflow_monthly
        GROUP BY month
        ORDER BY month
      `);
      res.json(rows);
    } catch (err) {
      this.handleError(err, res, 'cashflow.getCompanyCashflow');
    }
  }
}

const instance = new CashflowController();
export default instance;
