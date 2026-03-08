/**
 * @file Contacts model — extends TableModel for tenant-scope contacts
 * @module core/models/Contacts
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import contactsSchema from '../schemas/contactsSchema.js';

export default class Contacts extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, contactsSchema, logger);
  }
}
