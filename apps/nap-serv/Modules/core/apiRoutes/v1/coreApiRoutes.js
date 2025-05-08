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
import addressesApi from './addressesApi.js';
import contactsApi from './contactsApi.js';
import interCompaniesApi from './interCompaniesApi.js';
import vendorsApi from './vendorsApi.js';

const router = express.Router();

router.use('/v1/addresses', addressesApi);
router.use('/v1/contacts', contactsApi);
router.use('/v1/inter-companies', interCompaniesApi);
router.use('/v1/vendors', vendorsApi);

console.log('Loaded coreApi router');

export default router;
