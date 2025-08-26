'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import express from 'express';
import addressesRouter from './addressesRouter.js';
import contactsRouter from './contactsRouter.js';
import interCompaniesRouter from './interCompaniesRouter.js';
import vendorsRouter from './vendorsRouter.js';
import clientsRouter from './clientsRouter.js';
import employeesRouter from './employeesRouter.js';

const router = express.Router();

router.use('/v1/addresses', addressesRouter);
router.use('/v1/contacts', contactsRouter);
router.use('/v1/inter-companies', interCompaniesRouter);
router.use('/v1/vendors', vendorsRouter);
router.use('/v1/clients', clientsRouter);
router.use('/v1/employees', employeesRouter);

console.log('Loaded core modules router');

export default router;
