/**
 * @file Repository map for the projects module (tenant-scope)
 * @module projects/projectsRepositories
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import Projects from './models/Projects.js';
import Units from './models/Units.js';
import TaskGroups from './models/TaskGroups.js';
import TasksMaster from './models/TasksMaster.js';
import Tasks from './models/Tasks.js';
import CostItems from './models/CostItems.js';
import ChangeOrders from './models/ChangeOrders.js';
import TemplateUnits from './models/TemplateUnits.js';
import TemplateTasks from './models/TemplateTasks.js';
import TemplateCostItems from './models/TemplateCostItems.js';
import TemplateChangeOrders from './models/TemplateChangeOrders.js';

const repositories = {
  projects: Projects,
  units: Units,
  taskGroups: TaskGroups,
  tasksMaster: TasksMaster,
  tasks: Tasks,
  costItems: CostItems,
  changeOrders: ChangeOrders,
  templateUnits: TemplateUnits,
  templateTasks: TemplateTasks,
  templateCostItems: TemplateCostItems,
  templateChangeOrders: TemplateChangeOrders,
};

export default repositories;
