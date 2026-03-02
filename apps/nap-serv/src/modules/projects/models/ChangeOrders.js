/**
 * @file ChangeOrders model
 * @module projects/models/ChangeOrders
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import changeOrdersSchema from '../schemas/changeOrdersSchema.js';

export default class ChangeOrders extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, changeOrdersSchema, logger);
  }
}
