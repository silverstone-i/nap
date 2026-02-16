/**
 * @file Sources controller — standard CRUD (sources are primarily auto-created)
 * @module core/controllers/sourcesController
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
