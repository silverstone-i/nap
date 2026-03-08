/**
 * @file Central route registry — mounts all module routes under /api
 * @module nap-serv/apiRoutes
 *
 * Routes are added here as each phase is implemented.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';
import authRouter from './system/auth/apiRoutes/v1/authRouter.js';
import tenantsApiRoutes from './system/tenants/apiRoutes/v1/tenantsApiRoutes.js';
import coreApiRoutes from './system/core/apiRoutes/v1/coreApiRoutes.js';
import projectsApiRoutes from './modules/projects/apiRoutes/v1/projectsApiRoutes.js';
import activitiesApiRoutes from './modules/activities/apiRoutes/v1/activitiesApiRoutes.js';
import bomApiRoutes from './modules/bom/apiRoutes/v1/bomApiRoutes.js';
import apApiRoutes from './modules/ap/apiRoutes/v1/apApiRoutes.js';
import arApiRoutes from './modules/ar/apiRoutes/v1/arApiRoutes.js';
import accountingApiRoutes from './modules/accounting/apiRoutes/v1/accountingApiRoutes.js';
import reportsApiRoutes from './modules/reports/apiRoutes/v1/reportsApiRoutes.js';

const router = Router();

// Auth routes (public: login/refresh/logout; protected: me/check/change-password)
router.use('/auth', authRouter);

// Tenant management routes (NapSoft-only: tenants, nap-users, admin operations)
router.use('/tenants', tenantsApiRoutes);

// Core entity routes (tenant-scope: vendors, clients, employees, contacts, etc.)
router.use('/core', coreApiRoutes);

// Projects module routes (tenant-scope: projects, units, tasks, cost-items, etc.)
router.use('/projects', projectsApiRoutes);

// Activities module routes (tenant-scope: categories, activities, deliverables, budgets, etc.)
router.use('/activities', activitiesApiRoutes);

// BOM module routes (tenant-scope: catalog-skus, vendor-skus, vendor-pricing)
router.use('/bom', bomApiRoutes);

// AP module routes (tenant-scope: ap-invoices, ap-invoice-lines, payments, ap-credit-memos)
router.use('/ap', apApiRoutes);

// AR module routes (tenant-scope: ar-invoices, ar-invoice-lines, receipts)
router.use('/ar', arApiRoutes);

// Accounting module routes (tenant-scope: chart-of-accounts, journal-entries, ledger-balances, etc.)
router.use('/accounting', accountingApiRoutes);

// Reports module routes (tenant-scope: profitability, cashflow, aging, margin analysis)
router.use('/reports', reportsApiRoutes);

export default router;
