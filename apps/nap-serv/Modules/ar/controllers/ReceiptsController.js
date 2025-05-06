

'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { db } from '../../../src/db/db.js';

export const ReceiptsController = {
  async create(req, res) {
    try {
      const receipt = await db.receipts.insert(req.body);
      res.status(201).json(receipt);
    } catch (err) {
      console.error('Error creating receipt:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getAll(req, res) {
    try {
      const receipts = await db.receipts.findAll();
      res.json(receipts);
    } catch (err) {
      console.error('Error fetching receipts:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const receipt = await db.receipts.findById(req.params.id);
      if (!receipt) return res.status(404).json({ error: 'Receipt not found' });
      res.json(receipt);
    } catch (err) {
      console.error('Error fetching receipt:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const updated = await db.receipts.update(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Receipt not found' });
      res.json(updated);
    } catch (err) {
      console.error('Error updating receipt:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async remove(req, res) {
    try {
      const deleted = await db.receipts.delete(req.params.id);
      if (deleted === 0) return res.status(404).json({ error: 'Receipt not found' });
      res.status(204).end();
    } catch (err) {
      console.error('Error deleting receipt:', err);
      res.status(500).json({ error: err.message });
    }
  },
};

export default ReceiptsController;