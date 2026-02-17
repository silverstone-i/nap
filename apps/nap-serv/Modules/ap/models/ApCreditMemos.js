/**
 * @file ApCreditMemos model — extends TableModel for AP credit memo entities
 * @module ap/models/ApCreditMemos
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import apCreditMemosSchema from '../schemas/apCreditMemosSchema.js';

export default class ApCreditMemos extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, apCreditMemosSchema, logger);
  }
}
