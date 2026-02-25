/**
 * @file TenantNumberSequenceState model — extends TableModel for sequence counters
 * @module core/models/TenantNumberSequenceState
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import tenantNumberSequenceStateSchema from '../schemas/tenantNumberSequenceStateSchema.js';

export default class TenantNumberSequenceState extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, tenantNumberSequenceStateSchema, logger);
  }
}
