/**
 * @file Payments model — extends TableModel for AP payment entities
 * @module ap/models/Payments
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import paymentsSchema from '../schemas/paymentsSchema.js';

export default class Payments extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, paymentsSchema, logger);
  }
}
