/**
 * @file DeliverableAssignments controller — standard CRUD
 * @module activities/controllers/deliverableAssignmentsController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';

class DeliverableAssignmentsController extends BaseController {
  constructor() {
    super('deliverableAssignments', 'deliverable-assignment');
  }
}

const instance = new DeliverableAssignmentsController();
export default instance;
export { DeliverableAssignmentsController };
