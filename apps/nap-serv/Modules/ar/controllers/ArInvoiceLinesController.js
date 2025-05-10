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

class ArInvoiceLinesController extends BaseController {
  constructor(model = db.arInvoiceLines) {
    super('arInvoiceLines', 'AR Invoice Line');
    this.model = model;
  }
}

const instance = new ArInvoiceLinesController();

export default instance; // Use in production and development environments
export { ArInvoiceLinesController }; // Use in test environment