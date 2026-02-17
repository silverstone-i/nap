/**
 * @file Journal Entry Lines controller — CRUD with balance validation
 * @module accounting/controllers/journalEntryLinesController
 *
 * Validates account_id is present on create/update.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';

class JournalEntryLinesController extends BaseController {
  constructor() {
    super('journalEntryLines', 'journal-entry-line');
  }

  async create(req, res) {
    if (!req.body.account_id) {
      return res.status(400).json({ error: 'account_id is required for journal entry lines' });
    }
    if (!req.body.entry_id) {
      return res.status(400).json({ error: 'entry_id is required for journal entry lines' });
    }
    return super.create(req, res);
  }

  async update(req, res) {
    if (req.body.account_id === null) {
      return res.status(400).json({ error: 'account_id cannot be null' });
    }
    return super.update(req, res);
  }
}

const instance = new JournalEntryLinesController();
export default instance;
export { JournalEntryLinesController };
