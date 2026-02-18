/**
 * @file FieldGroupDefinitions model — extends TableModel for RBAC Layer 4 column-group definitions
 * @module core/models/FieldGroupDefinitions
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import fieldGroupDefinitionsSchema from '../schemas/fieldGroupDefinitionsSchema.js';

export default class FieldGroupDefinitions extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, fieldGroupDefinitionsSchema, logger);
  }
}
