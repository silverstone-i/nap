/**
 * @file FieldGroupGrants model — extends TableModel for RBAC Layer 4 role-to-field-group assignments
 * @module core/models/FieldGroupGrants
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import fieldGroupGrantsSchema from '../schemas/fieldGroupGrantsSchema.js';

export default class FieldGroupGrants extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, fieldGroupGrantsSchema, logger);
  }
}
