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

class TasksController extends BaseController {
  constructor() {
    super('tasks');
  }
}

const instance = new TasksController();

export default instance;
export { TasksController };
