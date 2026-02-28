/**
 * @file Repository map for the activities module (tenant-scope)
 * @module activities/activitiesRepositories
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import Categories from './models/Categories.js';
import Activities from './models/Activities.js';
import Deliverables from './models/Deliverables.js';
import DeliverableAssignments from './models/DeliverableAssignments.js';
import Budgets from './models/Budgets.js';
import CostLines from './models/CostLines.js';
import ActualCosts from './models/ActualCosts.js';
import VendorParts from './models/VendorParts.js';

const repositories = {
  categories: Categories,
  activities: Activities,
  deliverables: Deliverables,
  deliverableAssignments: DeliverableAssignments,
  budgets: Budgets,
  costLines: CostLines,
  actualCosts: ActualCosts,
  vendorParts: VendorParts,
};

export default repositories;
