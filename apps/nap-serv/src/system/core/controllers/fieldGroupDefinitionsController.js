/**
 * @file Field group definitions controller — CRUD for RBAC Layer 4 column groups
 * @module core/controllers/fieldGroupDefinitionsController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class FieldGroupDefinitionsController extends BaseController {
  constructor() {
    super('fieldGroupDefinitions');
  }
}

const instance = new FieldGroupDefinitionsController();
export default instance;
export { FieldGroupDefinitionsController };
