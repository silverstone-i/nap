/**
 * @file Employees router — /api/core/v1/employees
 * @module core/apiRoutes/v1/employeesRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import createRouter from '../../../../lib/createRouter.js';
import employeesController from '../../controllers/employeesController.js';

export default createRouter(employeesController);
