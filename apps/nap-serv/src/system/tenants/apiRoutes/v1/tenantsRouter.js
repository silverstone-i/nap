/**
 * @file Tenants router — NapSoft-only CRUD for tenant management per PRD §3.2.1
 * @module tenants/apiRoutes/v1/tenantsRouter
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import tenantsController from '../../controllers/tenantsController.js';
import createRouter from '../../../../lib/createRouter.js';
import { requireNapsoftTenant } from '../../../../middleware/requireNapsoftTenant.js';
import { withMeta } from '../../../../middleware/withMeta.js';

const meta = withMeta({ module: 'tenants', router: 'tenants' });

// requireNapsoftTenant gates all routes to NapSoft users only.
// RBAC not applied — access control relies on requireNapsoftTenant + moduleEntitlement.
export default createRouter(
  tenantsController,
  (router) => {
    router.get(
      '/:id/modules',
      requireNapsoftTenant,
      meta,
      (req, res) => tenantsController.getAllowedModules(req, res),
    );
    router.get(
      '/:id/contacts',
      requireNapsoftTenant,
      meta,
      (req, res) => tenantsController.getContacts(req, res),
    );
  },
  {
    postMiddlewares: [requireNapsoftTenant, meta],
    getMiddlewares: [requireNapsoftTenant, meta],
    putMiddlewares: [requireNapsoftTenant, meta],
    deleteMiddlewares: [requireNapsoftTenant, meta],
    patchMiddlewares: [requireNapsoftTenant, meta],
  },
);
