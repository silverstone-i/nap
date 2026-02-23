/**
 * @file Sources controller — standard CRUD for the polymorphic sources table
 * @module core/controllers/sourcesController
 *
 * Sources are typically auto-created by vendor/client/employee controllers.
 * This controller provides read access and manual management if needed.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class SourcesController extends BaseController {
  constructor() {
    super('sources');
  }
}

const instance = new SourcesController();
export default instance;
export { SourcesController };
