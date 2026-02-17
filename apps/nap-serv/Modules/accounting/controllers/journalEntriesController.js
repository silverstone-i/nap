/**
 * @file Journal Entries controller — create, post, reverse, list
 * @module accounting/controllers/journalEntriesController
 *
 * Status workflow: pending → posted → reversed
 * Delegates to postingService for transactional operations.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';
import { createJournalEntry, postEntry, reverseEntry } from '../services/postingService.js';
import logger from '../../../src/utils/logger.js';

const VALID_STATUSES = ['pending', 'posted', 'reversed'];

class JournalEntriesController extends BaseController {
  constructor() {
    super('journalEntries', 'journal-entry');
  }

  async create(req, res) {
    if (req.body.status && !VALID_STATUSES.includes(req.body.status)) {
      return res.status(400).json({ error: `Invalid journal entry status: ${req.body.status}` });
    }

    // If lines are provided, use posting service for transactional creation
    if (req.body.lines && Array.isArray(req.body.lines)) {
      try {
        const schema = this.getSchema(req);
        const entry = await createJournalEntry(schema, req.body);
        return res.status(201).json(entry);
      } catch (err) {
        if (err.message.includes('does not balance') || err.message.includes('must have at least')) {
          return res.status(400).json({ error: err.message });
        }
        return this.handleError(err, res, 'creating', this.errorLabel);
      }
    }

    return super.create(req, res);
  }

  async post(req, res) {
    try {
      const schema = this.getSchema(req);
      const entryId = req.body.entry_id || req.query.id;
      if (!entryId) {
        return res.status(400).json({ error: 'entry_id is required' });
      }
      const result = await postEntry(schema, entryId);
      return res.json(result);
    } catch (err) {
      if (err.message.includes('not found') || err.message.includes('Cannot post')) {
        return res.status(400).json({ error: err.message });
      }
      return this.handleError(err, res, 'posting', this.errorLabel);
    }
  }

  async reverse(req, res) {
    try {
      const schema = this.getSchema(req);
      const entryId = req.body.entry_id || req.query.id;
      if (!entryId) {
        return res.status(400).json({ error: 'entry_id is required' });
      }
      const tenantId = req.user?.tenant_id || req.body.tenant_id;
      const result = await reverseEntry(schema, entryId, tenantId);
      return res.status(201).json(result);
    } catch (err) {
      if (err.message.includes('not found') || err.message.includes('Cannot reverse')) {
        return res.status(400).json({ error: err.message });
      }
      return this.handleError(err, res, 'reversing', this.errorLabel);
    }
  }
}

const instance = new JournalEntriesController();
export default instance;
export { JournalEntriesController, VALID_STATUSES };
