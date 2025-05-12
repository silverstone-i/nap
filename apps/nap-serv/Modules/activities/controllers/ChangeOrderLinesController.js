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

class ChangeOrderLinesController extends BaseController {
  constructor() {
    super('changeOrderLines');
  }

  /**
   * Approve a change order line.
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async approve(req, res) {
    const id = req.params.id;
    const approvedBy = req.user?.email || 'system';

    try {
      const changeOrder = await this.model.findById(id);

      if (!changeOrder) {
        return res.status(404).json({ error: 'Change order not found.' });
      }

      if (changeOrder.status === 'approved') {
        return res.status(400).json({ error: 'Change order already approved.' });
      }

      const updated = await this.model.updateWhere(
        { id },
        {
          status: 'approved',
          approved_by: approvedBy,
          approved_at: new Date().toISOString(),
          updated_by: approvedBy,
        }
      );

      res.status(200).json({ approved: updated.rowCount });
    } catch (err) {
      console.error('Error approving change order:', err);
      res.status(500).json({ error: 'Failed to approve change order.' });
    }
  }
}

const instance = new ChangeOrderLinesController();

export default instance; // Use in production and development environments
export { ChangeOrderLinesController }; // Use in test environment
