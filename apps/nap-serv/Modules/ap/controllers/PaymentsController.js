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

class PaymentsController extends BaseController {
  constructor(model = db.payments) {
    super('payments', 'Payment');
    this.model = model;
  }
}

const instance = new PaymentsController();

export default instance; // Use in production and development environments
export { PaymentsController }; // Use in test environment