/**
 * @file Contacts router — /api/core/v1/contacts
 * @module core/apiRoutes/v1/contactsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import contactsController from '../../controllers/contactsController.js';

export default createRouter(contactsController);
