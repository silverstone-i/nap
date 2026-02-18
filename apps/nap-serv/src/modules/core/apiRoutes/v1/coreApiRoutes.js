/**
 * @file Core module route aggregator — mounts core sub-routers under /api/core
 * @module core/apiRoutes/v1/coreApiRoutes
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';
import adminRouter from './adminRouter.js';
import vendorsRouter from './vendorsRouter.js';
import clientsRouter from './clientsRouter.js';
import employeesRouter from './employeesRouter.js';
import contactsRouter from './contactsRouter.js';
import addressesRouter from './addressesRouter.js';
import interCompaniesRouter from './interCompaniesRouter.js';
import sourcesRouter from './sourcesRouter.js';
import rolesRouter from './rolesRouter.js';
import roleMembersRouter from './roleMembersRouter.js';
import policiesRouter from './policiesRouter.js';
import policyCatalogRouter from './policyCatalogRouter.js';

const router = Router();

router.use('/v1/admin', adminRouter);
router.use('/v1/sources', sourcesRouter);
router.use('/v1/vendors', vendorsRouter);
router.use('/v1/clients', clientsRouter);
router.use('/v1/employees', employeesRouter);
router.use('/v1/contacts', contactsRouter);
router.use('/v1/addresses', addressesRouter);
router.use('/v1/inter-companies', interCompaniesRouter);
router.use('/v1/roles', rolesRouter);
router.use('/v1/role-members', roleMembersRouter);
router.use('/v1/policies', policiesRouter);
router.use('/v1/policy-catalog', policyCatalogRouter);

export default router;
