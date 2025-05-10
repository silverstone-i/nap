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

class UnitAssignmentsController extends BaseController {
  constructor() {
    super('unitAssignments');
  }
}

const instance = new UnitAssignmentsController();

export default instance; // Use in production and development environments
export { UnitAssignmentsController }; // Use in test environment