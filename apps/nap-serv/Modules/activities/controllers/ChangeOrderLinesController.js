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

const ChangeOrderLinesController = {
  async create(req, res) {
    try {
      const row = await db.changeOrderLines.insert(req.body);
      res.status(201).json(row);
    } catch (err) {
      console.error('Error creating change order line:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getAll(req, res) {
    try {
      const rows = await db.changeOrderLines.findAll();
      res.json(rows);
    } catch (err) {
      console.error('Error fetching change order lines:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const row = await db.changeOrderLines.findById(req.params.id);
      if (!row) return res.status(404).json({ error: 'Change order lines not found' });
      res.json(row);
    } catch (err) {
      console.error('Error fetching change order line by id:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const updated = await db.changeOrderLines.update(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Change order lines not found' });
      res.json(updated);
    } catch (err) {
      console.error('Error updating change order line:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async remove(req, res) {
    try {
      const deleted = await db.changeOrderLines.delete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Change order lines not found' });
      res.status(204).end();
    } catch (err) {
      console.error('Error deleting change order line:', err);
      res.status(500).json({ error: err.message });
    }
  }
};

export default ChangeOrderLinesController;