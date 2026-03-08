/**
 * @file Repository map for the projects module (tenant-scope)
 * @module projects/projectsRepositories
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

// Template tables
import TemplateUnits from './models/TemplateUnits.js';
import TemplateTasks from './models/TemplateTasks.js';
import TemplateCostItems from './models/TemplateCostItems.js';
import TemplateChangeOrders from './models/TemplateChangeOrders.js';

// Reference tables
import TaskGroups from './models/TaskGroups.js';
import TasksMaster from './models/TasksMaster.js';

// Core project tables
import Projects from './models/Projects.js';
import ProjectClients from './models/ProjectClients.js';
import Units from './models/Units.js';
import Tasks from './models/Tasks.js';
import CostItems from './models/CostItems.js';
import ChangeOrders from './models/ChangeOrders.js';

const repositories = {
  // Templates
  templateUnits: TemplateUnits,
  templateTasks: TemplateTasks,
  templateCostItems: TemplateCostItems,
  templateChangeOrders: TemplateChangeOrders,

  // Reference
  taskGroups: TaskGroups,
  tasksMaster: TasksMaster,

  // Project entities
  projects: Projects,
  projectClients: ProjectClients,
  units: Units,
  tasks: Tasks,
  costItems: CostItems,
  changeOrders: ChangeOrders,
};

export default repositories;
