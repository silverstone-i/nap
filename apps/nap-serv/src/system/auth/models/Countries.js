/**
 * @file Countries model — ISO 3166-1 alpha-2 reference data (admin scope)
 * @module auth/models/Countries
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import countriesSchema from '../schemas/countriesSchema.js';

export default class Countries extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, countriesSchema, logger);
  }
}
