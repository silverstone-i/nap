/**
 * @file TemplateChangeOrders model — extends TableModel for template change orders
 * @module projects/models/TemplateChangeOrders
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import templateChangeOrdersSchema from '../schemas/templateChangeOrdersSchema.js';

export default class TemplateChangeOrders extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, templateChangeOrdersSchema, logger);
  }
}
