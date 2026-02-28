/**
 * @file Project clients controller — standard CRUD for project-client associations
 * @module projects/controllers/projectClientsController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class ProjectClientsController extends BaseController {
  constructor() {
    super('projectClients');
  }
}

const instance = new ProjectClientsController();
export default instance;
export { ProjectClientsController };
