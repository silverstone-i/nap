'use strict';
import { assertStatusAllowed } from '../logic/templateLogic.js';

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

//   async lockByTemplate(req, res) {
//     const subProjectId = req.params.templateId;
//     if (!subProjectId) {
//       return res.status(400).json({ error: 'Missing sub-project ID' });
//     }
//     const updatedBy = req.user?.email || 'system';

//     try {
//       const costLines = await this.model.findWhere([
//         { sub_project_id: subProjectId },
//       ]);
//       if (!costLines.length) {
//         return res.status(200).json({ locked: 0 });
//       }

//       const result = await this.model.updateWhere(
//         { id: { $in: costLines.map(line => line.id) } },
//         {
//           status: 'locked',
//           updated_by: updatedBy,
//         }
//       );

//       res.status(200).json({ locked: result });
//     } catch (err) {
//       console.error('Error locking cost lines:', err);
//       res.status(500).json({ error: 'Failed to lock cost lines.' });
//     }
//   }
}

const instance = new CostLinesController();

export default instance; // Use in production and development environments
export { CostLinesController }; // Use in test environment
