/**
 * @file Phone numbers controller — standard CRUD
 * @module core/controllers/phoneNumbersController
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class PhoneNumbersController extends BaseController {
  constructor() {
    super('phoneNumbers');
  }
}

const instance = new PhoneNumbersController();
export default instance;
export { PhoneNumbersController };
