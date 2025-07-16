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

class EmployeesController extends BaseController {
  constructor() {
    super('employees');
  }
}

const instance = new EmployeesController();

export default instance; // Use in production and development environments
export { EmployeesController }; // Use in test environment
