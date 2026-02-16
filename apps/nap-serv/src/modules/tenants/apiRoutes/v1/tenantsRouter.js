/**
 * @file Tenants router — NapSoft-only CRUD for tenant management per PRD §3.2.1
 * @module tenants/apiRoutes/v1/tenantsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import tenantsController from '../../controllers/tenantsController.js';
import createRouter from '../../../../lib/createRouter.js';
import { requireNapsoftTenant } from '../../../../middleware/requireNapsoftTenant.js';

export default createRouter(
  tenantsController,
  (router) => {
    router.get('/:id/modules', requireNapsoftTenant, (req, res) => tenantsController.getAllowedModules(req, res));
  },
  {
    postMiddlewares: [requireNapsoftTenant],
    getMiddlewares: [requireNapsoftTenant],
    putMiddlewares: [requireNapsoftTenant],
    deleteMiddlewares: [requireNapsoftTenant],
    patchMiddlewares: [requireNapsoftTenant],
  },
);
