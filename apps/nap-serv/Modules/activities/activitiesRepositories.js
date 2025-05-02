'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

import Activities from "./models/Activities.js";
import Categories from "./models/Categories.js";
import CostLines from "./models/CostLines.js";
import VendorParts from "./models/VendorParts.js";
import ActivityActuals from "./models/ActivityActuals.js";
import ActivityBudgets from "./models/ActivityBudgets.js";
import Projects from "./models/Projects.js";
import ProjectActivities from "./models/ProjectActivities.js";
import ProjectProfitabilityView from "./models/ProjectProfitabilityView.js";
import ActivityProfitabilityView from "./models/ActivityProfitabilityView.js";
import ProjectActualProfitabilityView from "./models/ProjectActualProfitabilityView.js";

const repositories = {
  activities: Activities,
  categories: Categories,
  costLines: CostLines,
  vendorParts: VendorParts,
  activityActuals: ActivityActuals,
  activityBudgets: ActivityBudgets,
  projects: Projects,
  projectActivities: ProjectActivities,
  projectProfitabilityView: ProjectProfitabilityView,
  ActivityProfitabilityView: ActivityProfitabilityView,
  projectActualProfitabilityView: ProjectActualProfitabilityView,
};

export default repositories;