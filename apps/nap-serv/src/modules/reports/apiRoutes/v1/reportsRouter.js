/**
 * @file Reports router — GET-only report endpoints
 * @module reports/apiRoutes/v1/reportsRouter
 *
 * Route ordering: /forecast before /:projectId to avoid param capture.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';
import profitabilityController from '../../controllers/profitabilityController.js';
import cashflowController from '../../controllers/cashflowController.js';
import costBreakdownController from '../../controllers/costBreakdownController.js';
import arAgingController from '../../controllers/arAgingController.js';
import apAgingController from '../../controllers/apAgingController.js';
import marginAnalysisController from '../../controllers/marginAnalysisController.js';

const router = Router();

// Ping
router.get('/ping', (_req, res) => res.json({ message: 'pong' }));

// Profitability
router.get('/project-profitability', (req, res) => profitabilityController.getAll(req, res));
router.get('/project-profitability/:projectId', (req, res) => profitabilityController.getByProject(req, res));

// Cashflow — forecast BEFORE :projectId to avoid param capture
router.get('/project-cashflow/:projectId/forecast', (req, res) => cashflowController.getForecast(req, res));
router.get('/project-cashflow/:projectId', (req, res) => cashflowController.getByProject(req, res));

// Cost breakdown
router.get('/project-cost-breakdown/:projectId', (req, res) => costBreakdownController.getByProject(req, res));

// AR aging
router.get('/ar-aging', (req, res) => arAgingController.getAll(req, res));
router.get('/ar-aging/:clientId', (req, res) => arAgingController.getByClient(req, res));

// AP aging
router.get('/ap-aging', (req, res) => apAgingController.getAll(req, res));
router.get('/ap-aging/:vendorId', (req, res) => apAgingController.getByVendor(req, res));

// Company-wide cashflow
router.get('/company-cashflow', (req, res) => cashflowController.getCompanyCashflow(req, res));

// Margin analysis
router.get('/margin-analysis', (req, res) => marginAnalysisController.getAll(req, res));

export default router;
