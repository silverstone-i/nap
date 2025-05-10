'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { db } from '../../../src/db/db.js';
import BaseController from '../../../src/utils/BaseController.js';

// Class-based controller for AP Credit Memos, supporting model injection for testing
class ApCreditMemosController extends BaseController {
  constructor(model = db.apCreditMemos) {
    super('apCreditMemos', 'AP Credit Memo');
    this.model = model;
  }
}

const instance = new ApCreditMemosController();

export default instance; // Use in production and development environments
export { ApCreditMemosController }; // Use in test environment