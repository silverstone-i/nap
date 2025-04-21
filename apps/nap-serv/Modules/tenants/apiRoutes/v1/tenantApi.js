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
import { TenantController } from '../controllers/tenantController.js';

const router = express.Router();

// Create a new tenant
router.post('/', TenantController.create);

// Retrieve all tenants
router.get('/', TenantController.getAll);

// Retrieve a specific tenant by ID
router.get('/:id', TenantController.getById);

// Update an existing tenant by ID
router.put('/:id', TenantController.update);

// Delete a tenant by ID
router.delete('/:id', TenantController.remove);

// Get allowed modules for a given tenant
router.get('/:id/modules', TenantController.getAllowedModules);

export default router;