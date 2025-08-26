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

class ActivitiesController extends BaseController {
  constructor() {
    super('activities');
  }
}

const instance = new ActivitiesController();

export default instance; // Use in production and development environments
export { ActivitiesController }; // Use in test environment
