

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

const UnitsController = {
  async create(req, res) {
    console.log('Creating unit:', req.body);
    
    try {
      const row = await db.units.insert(req.body);
      res.status(201).json(row);
    } catch (err) {
      console.error('Error creating unit:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getAll(req, res) {
    try {
      const rows = await db.units.findAll();
      res.json(rows);
    } catch (err) {
      console.error('Error fetching units:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const row = await db.units.findById(req.params.id);
      if (!row) return res.status(404).json({ error: 'Unit not found' });
      res.json(row);
    } catch (err) {
      console.error('Error fetching unit by id:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const updated = await db.units.update(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Unit not found' });
      res.json(updated);
    } catch (err) {
      console.error('Error updating unit:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async remove(req, res) {
    try {
      const deleted = await db.units.delete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Unit not found' });
      res.status(204).end();
    } catch (err) {
      console.error('Error deleting unit:', err);
      res.status(500).json({ error: err.message });
    }
  }
};

export default UnitsController;