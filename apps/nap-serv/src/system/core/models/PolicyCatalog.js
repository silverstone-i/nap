/**
 * @file PolicyCatalog model — extends TableModel for RBAC policy catalog
 * @module core/models/PolicyCatalog
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import policyCatalogSchema from '../schemas/policyCatalogSchema.js';

export default class PolicyCatalog extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, policyCatalogSchema, logger);
  }
}
