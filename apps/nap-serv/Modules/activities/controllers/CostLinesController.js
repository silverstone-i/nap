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
    const updatedBy = req.user?.email || 'system';

    try {
      const preview = await this.model.findOneBy({ unit_budget_id: unitBudgetId });
      if (!preview) {
        return res.status(404).json({ error: 'No cost lines found for unit budget' });
      }

      assertStatusAllowed(preview.status, ['approved'], 'lock cost lines');

      const result = await this.model.updateWhere(
        { unit_budget_id: unitBudgetId, status: 'approved' },
        { status: 'locked', updated_by: updatedBy }
      );

      res.status(200).json({ locked: result.rowCount });
    } catch (err) {
      console.error('Error locking cost lines:', err);
      res.status(500).json({ error: 'Failed to lock cost lines.' });
    }
  }
}

const instance = new CostLinesController();

export default instance; // Use in production and development environments
export { CostLinesController }; // Use in test environment
