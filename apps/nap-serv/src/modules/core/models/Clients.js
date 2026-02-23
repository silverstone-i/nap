/**
 * @file Clients model — extends TableModel for tenant-scope clients
 * @module core/models/Clients
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import clientsSchema from '../schemas/clientsSchema.js';

export default class Clients extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, clientsSchema, logger);
  }
}
