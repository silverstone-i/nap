/**
 * @file Employees model — extends TableModel for employee entities
 * @module core/models/Employees
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import employeesSchema from '../schemas/employeesSchema.js';

export default class Employees extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, employeesSchema, logger);
  }
}
