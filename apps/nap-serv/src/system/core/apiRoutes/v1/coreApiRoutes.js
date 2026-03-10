/**
 * @file Core module route aggregator — mounts entity sub-routers under /api/core
 * @module core/apiRoutes/v1/coreApiRoutes
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';
import sourcesRouter from './sourcesRouter.js';
import vendorsRouter from './vendorsRouter.js';
import clientsRouter from './clientsRouter.js';
import employeesRouter from './employeesRouter.js';
import contactsRouter from './contactsRouter.js';
import addressesRouter from './addressesRouter.js';
import phoneNumbersRouter from './phoneNumbersRouter.js';
import interCompaniesRouter from './interCompaniesRouter.js';
import taxIdentifiersRouter from './taxIdentifiersRouter.js';
import rolesRouter from './rolesRouter.js';
import policiesRouter from './policiesRouter.js';
import policyCatalogRouter from './policyCatalogRouter.js';
import stateFiltersRouter from './stateFiltersRouter.js';
import fieldGroupDefinitionsRouter from './fieldGroupDefinitionsRouter.js';
import fieldGroupGrantsRouter from './fieldGroupGrantsRouter.js';
import projectMembersRouter from './projectMembersRouter.js';
import companyMembersRouter from './companyMembersRouter.js';
import numberingConfigRouter from './numberingConfigRouter.js';

const router = Router();

router.use('/v1/sources', sourcesRouter);
router.use('/v1/vendors', vendorsRouter);
router.use('/v1/clients', clientsRouter);
router.use('/v1/employees', employeesRouter);
router.use('/v1/contacts', contactsRouter);
router.use('/v1/addresses', addressesRouter);
router.use('/v1/phone-numbers', phoneNumbersRouter);
router.use('/v1/inter-companies', interCompaniesRouter);
router.use('/v1/tax-identifiers', taxIdentifiersRouter);
router.use('/v1/roles', rolesRouter);
router.use('/v1/policies', policiesRouter);
router.use('/v1/policy-catalog', policyCatalogRouter);
router.use('/v1/state-filters', stateFiltersRouter);
router.use('/v1/field-group-definitions', fieldGroupDefinitionsRouter);
router.use('/v1/field-group-grants', fieldGroupGrantsRouter);
router.use('/v1/project-members', projectMembersRouter);
router.use('/v1/company-members', companyMembersRouter);
router.use('/v1/numbering-config', numberingConfigRouter);

export default router;
