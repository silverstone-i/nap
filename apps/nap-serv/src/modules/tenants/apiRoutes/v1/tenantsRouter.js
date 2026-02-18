/**
 * @file Tenants router — NapSoft-only CRUD for tenant management per PRD §3.2.1
 * @module tenants/apiRoutes/v1/tenantsRouter
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import tenantsController from '../../controllers/tenantsController.js';
import createRouter from '../../../../lib/createRouter.js';
import { requireNapsoftTenant } from '../../../../middleware/requireNapsoftTenant.js';
import { withMeta, rbac } from '../../../../middleware/rbac.js';

const meta = withMeta({ module: 'tenants', router: 'tenants' });

export default createRouter(
  tenantsController,
  (router) => {
    router.get('/:id/modules', requireNapsoftTenant, meta, rbac('view'), (req, res) => tenantsController.getAllowedModules(req, res));
  },
  {
    postMiddlewares: [requireNapsoftTenant, meta, rbac('full')],
    getMiddlewares: [requireNapsoftTenant, meta, rbac('view')],
    putMiddlewares: [requireNapsoftTenant, meta, rbac('full')],
    deleteMiddlewares: [requireNapsoftTenant, meta, rbac('full')],
    patchMiddlewares: [requireNapsoftTenant, meta, rbac('full')],
  },
);
