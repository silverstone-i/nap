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

const repositories = {
  activities: Activities,
  categories: Categories,
  costLines: CostLines,
  vendorParts: VendorParts,
  activityActuals: ActivityActuals,
  activityBudgets: ActivityBudgets,
};

export default repositories;