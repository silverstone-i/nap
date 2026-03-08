/**
 * @file PhoneNumbers model — polymorphic phone numbers linked via sources
 * @module core/models/PhoneNumbers
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import phoneNumbersSchema from '../schemas/phoneNumbersSchema.js';

export default class PhoneNumbers extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, phoneNumbersSchema, logger);
  }
}
