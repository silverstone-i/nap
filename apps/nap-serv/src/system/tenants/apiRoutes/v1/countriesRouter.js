/**
 * @file Countries router — /api/tenants/v1/countries
 * @module tenants/apiRoutes/v1/countriesRouter
 *
 * Read-only routes for ISO 3166-1 country reference data.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import countriesController from '../../controllers/countriesController.js';

export default createRouter(countriesController, null, {
  disablePost: true,
  disablePut: true,
  disableDelete: true,
  disablePatch: true,
  disableBulkInsert: true,
  disableBulkUpdate: true,
  disableImportXls: true,
});
