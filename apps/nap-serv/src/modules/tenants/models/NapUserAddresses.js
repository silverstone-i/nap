/**
 * @file NapUserAddresses model — extends TableModel for admin.nap_user_addresses
 * @module tenants/models/NapUserAddresses
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import napUserAddressesSchema from '../schemas/napUserAddressesSchema.js';

export default class NapUserAddresses extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, napUserAddressesSchema, logger);
  }
}
