'use strict';
import { assertStatusAllowed } from '../logic/budgetLogic.js';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import BaseController from '../../../src/utils/BaseController.js';

class CostLinesController extends BaseController {
  constructor() {
    super('costLines');
  }

  async lockByUnitBudget(req, res) {
    const unitBudgetId = req.params.unitBudgetId;
    if (!unitBudgetId) {
      return res.status(400).json({ error: 'Missing unit budget ID' });
    }
    const updatedBy = req.user?.email || 'system';

    try {
      const costLines = await this.model.findWhere([
        { column: 'unit_budget_id', op: '=', value: unitBudgetId },
      ]);
      if (!costLines.length) {
        return res.status(200).json({ locked: 0 });
      }

      const unitBudget = await this.model.db.oneOrNone(
        `SELECT status FROM tenantid.unit_budgets WHERE id = $1`,
        [unitBudgetId]
      );
      if (!unitBudget) {
        return res.status(404).json({ error: 'Unit budget not found' });
      }
      console.log('unitBudget', unitBudget);

      assertStatusAllowed(unitBudget.status, ['approved'], 'lock cost lines');
      console.log('assertStatusAllowed', unitBudget.status);

      const where = {
        id: { $in: costLines.map(line => line.id) },
      };
      console.log('where = ', where);

      const result = await this.model.updateWhere(where, {
        status: 'locked',
        updated_by: updatedBy,
      });

      console.log('controller result', result);
      res.status(200).json({ locked: result });
    } catch (err) {
      console.error('Error locking cost lines:', err);
      res.status(500).json({ error: 'Failed to lock cost lines.' });
    }
  }
}

const instance = new CostLinesController();

export default instance; // Use in production and development environments
export { CostLinesController }; // Use in test environment
