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

class ChangeOrderLinesController extends BaseController {
  constructor(model = db.changeOrderLines) {
    super('changeOrderLines', 'Change order lines');
    this.model = model;
  }
}

const instance = new ChangeOrderLinesController();

export default instance; // Use in production and development environments
export { ChangeOrderLinesController }; // Use in test environment
