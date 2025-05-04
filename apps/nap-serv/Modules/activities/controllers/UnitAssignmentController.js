

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

const UnitAssignmentController = {
  async create(req, res) {
    try {
      const row = await db.unitAssignments.insert(req.body);
      res.status(201).json(row);
    } catch (err) {
      console.error('Error creating project unit assignment:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getAll(req, res) {
    try {
      const rows = await db.unitAssignments.findAll();
      res.json(rows);
    } catch (err) {
      console.error('Error fetching project unit assignments:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const row = await db.unitAssignments.findById(req.params.id);
      if (!row) return res.status(404).json({ error: 'Unit assignment not found' });
      res.json(row);
    } catch (err) {
      console.error('Error fetching project unit assignment by id:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const updated = await db.unitAssignments.update(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      console.error('Error updating project unit assignment:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async remove(req, res) {
    try {
      await db.unitAssignments.delete(req.params.id);
      res.status(204).end();
    } catch (err) {
      console.error('Error deleting project unit assignment:', err);
      res.status(500).json({ error: err.message });
    }
  }
};

export default UnitAssignmentController;