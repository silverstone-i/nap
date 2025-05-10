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

class ArInvoicesController extends BaseController {
  constructor(model = db.arInvoices) {
    super('arInvoices', 'AR Invoice');
    this.model = model;
  }
}

const instance = new ArInvoicesController();

export default instance; // Use in production and development environments
export { ArInvoicesController }; // Use in test environment