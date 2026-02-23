/**
 * @file JournalEntries model — extends TableModel
 * @module accounting/models/JournalEntries
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import journalEntriesSchema from '../schemas/journalEntriesSchema.js';

export default class JournalEntries extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, journalEntriesSchema, logger);
  }
}
