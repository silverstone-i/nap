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
import { assertStatusAllowed } from '../logic/templateLogic.js';

class ChangeOrderLinesController extends BaseController {
  constructor() {
    super('changeOrderLines');
  }
}

const instance = new ChangeOrderLinesController();

export default instance; // Use in production and development environments
export { ChangeOrderLinesController }; // Use in test environment
