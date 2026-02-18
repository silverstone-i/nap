/**
 * @file StateFilters model — extends TableModel for RBAC Layer 3 record-state visibility
 * @module core/models/StateFilters
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import stateFiltersSchema from '../schemas/stateFiltersSchema.js';

export default class StateFilters extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, stateFiltersSchema, logger);
  }
}
