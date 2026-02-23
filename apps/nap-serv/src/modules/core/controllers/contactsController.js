/**
 * @file Contacts controller — standard CRUD for contacts linked via sources
 * @module core/controllers/contactsController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../lib/BaseController.js';

class ContactsController extends BaseController {
  constructor() {
    super('contacts');
  }
}

const instance = new ContactsController();
export default instance;
export { ContactsController };
