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

class VendorsController extends BaseController {
  constructor() {
    super('vendors');
  }
}

const instance = new VendorsController();

export default instance; // Use in production and development environments
export { VendorsController }; // Use in test environment