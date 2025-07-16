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
import ProjectsRouter from './ProjectsRouter.js';
import UnitsRouter from './UnitsRouter.js';
import UnitsTemplateRouter from './TemplateUnitsRouter.js';
import TemplateTasksRouter from './TemplateTasksRouter.js';
import TemplateCostItemsRouter from './TemplateCostItemsRouter.js';
import TemplateChangeOrdersRouter from './TemplateChangeOrdersRouter.js';
import TasksRouter from './TasksRouter.js';
import TaskGroupsRouter from './TaskGroupsRouter.js';
import TasksMasterRouter from './TasksMasterRouter.js';
import CostItemsRouter from './CostItemsRouter.js';
import ChangeOrdersRouter from './ChangeOrdersRouter.js';

const router = express.Router();

router.use('/v1/projects', ProjectsRouter);
router.use('/v1/units', UnitsRouter);
router.use('/v1/template-units', UnitsTemplateRouter);
router.use('/v1/template-tasks', TemplateTasksRouter);
router.use('/v1/template-cost-items', TemplateCostItemsRouter);
router.use('/v1/template-change-orders', TemplateChangeOrdersRouter);
router.use('/v1/tasks', TasksRouter);
router.use('/v1/task-groups', TaskGroupsRouter);
router.use('/v1/tasks-master', TasksMasterRouter);
router.use('/v1/cost-items', CostItemsRouter);
router.use('/v1/change-orders', ChangeOrdersRouter);

console.log('Loaded projects modules router');

export default router;
