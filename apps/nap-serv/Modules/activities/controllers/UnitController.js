

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

const UnitController = {
  async create(req, res) {
    try {
      const row = await db.projectUnits.insert(req.body);
      res.status(201).json(row);
    } catch (err) {
      console.error('Error creating project unit:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getAll(req, res) {
    try {
      const rows = await db.projectUnits.findAll();
      res.json(rows);
    } catch (err) {
      console.error('Error fetching project units:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const row = await db.projectUnits.findById(req.params.id);
      if (!row) return res.status(404).json({ error: 'Unit not found' });
      res.json(row);
    } catch (err) {
      console.error('Error fetching project unit by id:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const updated = await db.projectUnits.update(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      console.error('Error updating project unit:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async remove(req, res) {
    try {
      await db.projectUnits.delete(req.params.id);
      res.status(204).end();
    } catch (err) {
      console.error('Error deleting project unit:', err);
      res.status(500).json({ error: err.message });
    }
  }
};

export default UnitController;