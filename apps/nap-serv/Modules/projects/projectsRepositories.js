'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/
import ChangeOrders from './models/ChangeOrders.js';
import CostItems from './models/CostItems.js';
import Projects from './models/Projects.js';
import TaskGroups from './models/TaskGroups.js';
import Tasks from './models/Tasks.js';
import TasksMaster from './models/TasksMaster.js';
import TemplateChangeOrders from './models/TemplateChangeOrders.js';
import TemplateCostItems from './models/TemplateCostItems.js';
import TemplateTasks from './models/TemplateTasks.js';
import TemplateUnits from './models/TemplateUnits.js';
import Units from './models/Units.js';


const repositories = {
  changeOrders: ChangeOrders,
  costItems: CostItems,
  projects: Projects,
  taskGroups: TaskGroups,
  tasks: Tasks,
  tasksMaster: TasksMaster,
  templateChangeOrders: TemplateChangeOrders,
  templateCostItems: TemplateCostItems,
  templateTasks: TemplateTasks,
  templateUnits: TemplateUnits,
  units: Units,
};
export default repositories;
