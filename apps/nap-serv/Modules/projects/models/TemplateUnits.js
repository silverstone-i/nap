/**
 * @file TemplateUnits model — extends TableModel for unit templates
 * @module projects/models/TemplateUnits
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import templateUnitsSchema from '../schemas/templateUnitsSchema.js';

export default class TemplateUnits extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, templateUnitsSchema, logger);
  }
}
