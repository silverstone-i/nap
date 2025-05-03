

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

export const ActualCostsController = {
  async create(req, res) {
    try {
      const actual = await db.actualCosts.insert(req.body);
      res.status(201).json(actual);
    } catch (err) {
      console.error('Error creating actual cost:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getAll(req, res) {
    try {
      const rows = await db.actualCosts.findAll();
      res.json(rows);
    } catch (err) {
      console.error('Error fetching actual costs:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const item = await db.actualCosts.findById(req.params.id);
      if (!item) return res.status(404).json({ error: 'Not found' });
      res.json(item);
    } catch (err) {
      console.error('Error fetching actual cost by id:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const updated = await db.actualCosts.update(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      console.error('Error updating actual cost:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async remove(req, res) {
    try {
      await db.actualCosts.remove(req.params.id);
      res.status(204).end();
    } catch (err) {
      console.error('Error deleting actual cost:', err);
      res.status(500).json({ error: err.message });
    }
  }
};