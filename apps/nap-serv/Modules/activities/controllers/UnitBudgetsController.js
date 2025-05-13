'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import BaseController from '../../../src/utils/BaseController.js';
import CostLinesController from './CostLinesController.js';
import { validateStatusTransition } from '../logic/budgetLogic.js';

class UnitBudgetsController extends BaseController {
  constructor() {
    super('unitBudgets');
  }

  async submit(req, res) {
    try {
      const id = req.params.id;
      const existing = await this.model.findById(id);
      validateStatusTransition(existing.status, 'submitted');

      const updated = await this.model.update(id, {
        status: 'submitted',
        submitted_by: req.user?.email || 'system',
        submitted_at: new Date()
      });

      res.status(200).json(updated);
    } catch (err) {
      if (err.message.startsWith('Invalid status transition')) {
        return res.status(400).json({ error: err.message });
      }
      console.error('Error submitting budget:', err);
      res.status(500).json({ error: 'Failed to submit budget.' });
    }
  }

  async approve(req, res) {
    try {
      const id = req.params.id;
      const existing = await this.model.findById(id);
      validateStatusTransition(existing.status, 'approved');

      const updated = await this.model.update(id, {
        status: 'approved',
        approved_by: req.user?.email || 'system',
        approved_at: new Date()
      });

      await CostLinesController.lockByUnitBudget({ params: { unitBudgetId: id }, user: req.user }, { status: () => ({ json: () => {} }) });

      res.status(200).json(updated);
    } catch (err) {
      if (err.message.startsWith('Invalid status transition')) {
        return res.status(400).json({ error: err.message });
      }
      console.error('Error approving budget:', err);
      res.status(500).json({ error: 'Failed to approve budget.' });
    }
  }
}

const instance = new UnitBudgetsController();

export default instance; // Use in production and development environments
export { UnitBudgetsController }; // Use in test environment
