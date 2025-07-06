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
import ProjectsControllerRouter from './ProjectsControllerRouter.js';
import UnitsControllerRouter from './UnitsControllerRouter.js';
import UnitsTemplateControllerRouter from './UnitsTemplateControllerRouter.js';
import TemplateTasksControllerRouter from './TemplateTasksControllerRouter.js';
import TemplateCostItemsControllerRouter from './TemplateCostItemsControllerRouter.js';
import TemplateChangeOrdersControllerRouter from './TemplateChangeOrdersControllerRouter.js';
import TasksControllerRouter from './TasksControllerRouter.js';
import TaskGroupsControllerRouter from './TaskGroupsControllerRouter.js';
import TasksMasterControllerRouter from './TasksMasterControllerRouter.js';
import CostItemsControllerRouter from './CostItemsControllerRouter.js';
import ChangeOrdersControllerRouter from './ChangeOrdersControllerRouter.js';

const router = express.Router();

router.use('/v1/projects', ProjectsControllerRouter);
router.use('/v1/units', UnitsControllerRouter);
router.use('/v1/unit-templates', UnitsTemplateControllerRouter);
router.use('/v1/template-tasks', TemplateTasksControllerRouter);
router.use('/v1/template-cost-items', TemplateCostItemsControllerRouter);
router.use('/v1/template-change-orders', TemplateChangeOrdersControllerRouter);
router.use('/v1/tasks', TasksControllerRouter);
router.use('/v1/task-groups', TaskGroupsControllerRouter);
router.use('/v1/tasks-master', TasksMasterControllerRouter);
router.use('/v1/cost-items', CostItemsControllerRouter);
router.use('/v1/change-orders', ChangeOrdersControllerRouter);

console.log('Loaded projects router');

export default router;
