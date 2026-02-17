/**
 * @file JournalEntryLines model — extends TableModel
 * @module accounting/models/JournalEntryLines
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import journalEntryLinesSchema from '../schemas/journalEntryLinesSchema.js';

export default class JournalEntryLines extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, journalEntryLinesSchema, logger);
  }
}
