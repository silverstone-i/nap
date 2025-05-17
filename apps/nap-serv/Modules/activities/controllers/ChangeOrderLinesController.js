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
import { assertStatusAllowed } from '../logic/templateLogic.js';

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

      assertStatusAllowed(
        changeOrder.status,
        ['draft'],
        'approve change order'
      );

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

  // /**
  //  * Approve all change order lines by unit budget ID.
  //  * @param {import('express').Request} req
  //  * @param {import('express').Response} res
  //  */
  // async lockByTemplate(req, res) {
  //   console.log('req.params', req.params);

  //   const templateId = req.params.id;
  //   const approvedBy = req.user?.email || 'system';

  //   try {
  //     console.log('templateId', templateId);

  //     const template = await this.model.db.templates.findById(templateId);
  //     console.log('template', template);

  //     if (!template) {
  //       return res.status(404).json({ error: 'Template not found.' });
  //     }

  //     assertStatusAllowed(
  //       template.status,
  //       ['approved'],
  //       'approve change orders'
  //     );
  //     console.log('template.status', template.status);

  //     const rows = await this.model.findWhere([
  //       {
  //         sub_project_id: template.sub_project_id,
  //         status: 'pending',
  //       },
  //     ]);

  //     console.log('rows', rows);

  //     const idsToApprove = rows.map(row => row.id);
  //     if (idsToApprove.length === 0) {
  //       return res.status(200).json({ approved: 0 });
  //     }

  //     const where = { id: { $in: idsToApprove } };
  //     console.log('where = ', where);

  //     // const rowsToUpdate = await this.model.findWhere([
  //     //   { id: { $in: idsToApprove } },
  //     // ]); // ✅
  //     // console.log('Rows that will be updated:', rowsToUpdate);

  //     const result = await this.model.updateWhere(where, {
  //       status: 'locked',
  //       approved_by: approvedBy,
  //       approved_at: new Date().toISOString(),
  //       updated_by: approvedBy,
  //     });

  //     console.log('controller result', result);
  //     res.status(200).json({ approved: result });
  //   } catch (err) {
  //     console.error('Error approving change orders:', err);
  //     res.status(500).json({ error: 'Failed to approve change orders.' });
  //   }
  // }
}

const instance = new ChangeOrderLinesController();

export default instance; // Use in production and development environments
export { ChangeOrderLinesController }; // Use in test environment
