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

class ChartOfAccountsController extends BaseController {
  constructor() {
    super('chartOfAccounts');
  }
}

const instance = new ChartOfAccountsController();

export default instance; // Use in production and development environments
export { ChartOfAccountsController }; // Use in test environment