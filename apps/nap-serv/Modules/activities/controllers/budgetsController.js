/**
 * @file Budgets controller — CRUD with version management and approval workflow
 * @module activities/controllers/budgetsController
 *
 * Status workflow: draft -> submitted -> approved -> locked | rejected
 * Approved budgets become read-only; new changes spawn a new version.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';
import db from '../../../src/db/db.js';
import logger from '../../../src/utils/logger.js';

const VALID_TRANSITIONS = {
  draft: ['submitted'],
  submitted: ['approved', 'rejected'],
  approved: ['locked'],
  locked: [],
  rejected: [],
};

class BudgetsController extends BaseController {
  constructor() {
    super('budgets', 'budget');
  }

  async create(req, res) {
    if (req.body.status && !VALID_TRANSITIONS[req.body.status]) {
      return res.status(400).json({ error: `Invalid budget status: ${req.body.status}` });
    }
    return super.create(req, res);
  }

  async update(req, res) {
    if (req.body.status) {
      try {
        const schema = this.getSchema(req);
        const id = req.query.id;
        if (id) {
          const current = await this.model(schema).findById(id);
          if (!current) return res.status(404).json({ error: 'budget not found' });

          // Approved/locked budgets are read-only (no field changes except status transitions)
          if ((current.status === 'approved' || current.status === 'locked') && req.body.status !== 'locked') {
            return res.status(400).json({
              error: 'Approved budgets are read-only. Create a new version for changes.',
            });
          }

          const allowed = VALID_TRANSITIONS[current.status];
          if (!allowed || !allowed.includes(req.body.status)) {
            return res.status(400).json({
              error: `Invalid status transition: ${current.status} → ${req.body.status}`,
            });
          }

          // On submission, record submitted_by and submitted_at
          if (req.body.status === 'submitted') {
            req.body.submitted_by = req.user?.id || null;
            req.body.submitted_at = new Date().toISOString();
          }

          // On approval, record approved_by and approved_at
          if (req.body.status === 'approved') {
            req.body.approved_by = req.user?.id || null;
            req.body.approved_at = new Date().toISOString();
            logger.info(`Budget ${id} approved — version ${current.version}`);
          }
        }
      } catch (err) {
        return this.handleError(err, res, 'validating status for', this.errorLabel);
      }
    }
    return super.update(req, res);
  }

  /**
   * Create a new version of an existing budget.
   * Marks the current version as not current and creates a new draft version.
   */
  async createNewVersion(req, res) {
    try {
      const schema = this.getSchema(req);
      const { budget_id } = req.body;

      if (!budget_id) {
        return res.status(400).json({ error: 'budget_id is required to create a new version' });
      }

      const current = await this.model(schema).findById(budget_id);
      if (!current) return res.status(404).json({ error: 'budget not found' });

      if (current.status !== 'approved' && current.status !== 'locked') {
        return res.status(400).json({
          error: 'Only approved or locked budgets can have new versions created',
        });
      }

      // Mark old version as not current
      await db.none(
        `UPDATE ${schema}.budgets SET is_current = false WHERE id = $1`,
        [budget_id],
      );

      // Create new draft version
      const newBudget = await this.model(schema).insert({
        deliverable_id: current.deliverable_id,
        activity_id: current.activity_id,
        budgeted_amount: current.budgeted_amount,
        version: current.version + 1,
        is_current: true,
        status: 'draft',
      });

      logger.info(`Budget new version ${current.version + 1} created from ${budget_id}`);
      return res.status(201).json(newBudget);
    } catch (err) {
      return this.handleError(err, res, 'creating new version for', this.errorLabel);
    }
  }
}

const instance = new BudgetsController();
export default instance;
export { BudgetsController, VALID_TRANSITIONS };
