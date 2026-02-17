/**
 * @file Activities controller — standard CRUD
 * @module activities/controllers/activitiesController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';

class ActivitiesController extends BaseController {
  constructor() {
    super('activities', 'activity');
  }
}

const instance = new ActivitiesController();
export default instance;
export { ActivitiesController };
