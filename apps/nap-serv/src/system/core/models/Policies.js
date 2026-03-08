/**
 * @file Policies model — extends TableModel for RBAC permission policies
 * @module core/models/Policies
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import policiesSchema from '../schemas/policiesSchema.js';

export default class Policies extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, policiesSchema, logger);
  }
}
