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

class UnitBudgetsController extends BaseController {
  constructor() {
    super('unitBudgets');
  }
}

const instance = new UnitBudgetsController();

export default instance; // Use in production and development environments
export { UnitBudgetsController }; // Use in test environment
