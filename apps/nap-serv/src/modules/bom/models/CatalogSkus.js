/**
 * @file CatalogSkus model — extends TableModel for canonical catalog SKU entities
 * @module bom/models/CatalogSkus
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import catalogSkusSchema from '../schemas/catalogSkusSchema.js';

export default class CatalogSkus extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, catalogSkusSchema, logger);
  }
}
