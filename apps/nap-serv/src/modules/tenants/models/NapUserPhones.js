/**
 * @file NapUserPhones model — extends TableModel for admin.nap_user_phones
 * @module tenants/models/NapUserPhones
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import napUserPhonesSchema from '../schemas/napUserPhonesSchema.js';

export default class NapUserPhones extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, napUserPhonesSchema, logger);
  }
}
