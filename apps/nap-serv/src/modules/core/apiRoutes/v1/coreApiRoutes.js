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

const router = Router();

router.use('/v1/admin', adminRouter);
router.use('/v1/vendors', vendorsRouter);
router.use('/v1/clients', clientsRouter);
router.use('/v1/employees', employeesRouter);
router.use('/v1/contacts', contactsRouter);
router.use('/v1/addresses', addressesRouter);
router.use('/v1/inter-companies', interCompaniesRouter);

export default router;
