/**
 * @file Projects module route aggregator — mounts project sub-routers under /api/projects
 * @module projects/apiRoutes/v1/projectsApiRoutes
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { Router } from 'express';
import projectsRouter from './projectsRouter.js';
import unitsRouter from './unitsRouter.js';
import tasksRouter from './tasksRouter.js';
import taskGroupsRouter from './taskGroupsRouter.js';
import tasksMasterRouter from './tasksMasterRouter.js';
import costItemsRouter from './costItemsRouter.js';
import changeOrdersRouter from './changeOrdersRouter.js';
import templateUnitsRouter from './templateUnitsRouter.js';
import templateTasksRouter from './templateTasksRouter.js';
import templateCostItemsRouter from './templateCostItemsRouter.js';
import templateChangeOrdersRouter from './templateChangeOrdersRouter.js';

const router = Router();

router.use('/v1/projects', projectsRouter);
router.use('/v1/units', unitsRouter);
router.use('/v1/tasks', tasksRouter);
router.use('/v1/task-groups', taskGroupsRouter);
router.use('/v1/tasks-master', tasksMasterRouter);
router.use('/v1/cost-items', costItemsRouter);
router.use('/v1/change-orders', changeOrdersRouter);
router.use('/v1/template-units', templateUnitsRouter);
router.use('/v1/template-tasks', templateTasksRouter);
router.use('/v1/template-cost-items', templateCostItemsRouter);
router.use('/v1/template-change-orders', templateChangeOrdersRouter);

export default router;
