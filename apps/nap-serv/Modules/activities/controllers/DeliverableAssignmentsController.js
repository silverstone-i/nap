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

class DeliverableAssignmentsController extends BaseController {
  constructor() {
    super('deliverableAssignments');
  }
}

const instance = new DeliverableAssignmentsController();

export default instance; // Use in production and development environments
export { DeliverableAssignmentsController }; // Use in test environment