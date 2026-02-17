/**
 * @file TemplateCostItems model — extends TableModel for template cost item definitions
 * @module projects/models/TemplateCostItems
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import templateCostItemsSchema from '../schemas/templateCostItemsSchema.js';

export default class TemplateCostItems extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, templateCostItemsSchema, logger);
  }
}
