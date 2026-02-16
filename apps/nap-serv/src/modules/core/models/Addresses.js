/**
 * @file Addresses model — extends TableModel for address entities
 * @module core/models/Addresses
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import addressesSchema from '../schemas/addressesSchema.js';

export default class Addresses extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, addressesSchema, logger);
  }
}
