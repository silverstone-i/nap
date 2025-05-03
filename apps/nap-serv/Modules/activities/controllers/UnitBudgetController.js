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

export const UnitBudgetController = {
  async create(req, res) {
    try {
      const row = await db.projectUnitBudgets.insert(req.body);
      res.status(201).json(row);
    } catch (err) {
      console.error('Error creating project unit budget:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getAll(req, res) {
    try {
      const rows = await db.projectUnitBudgets.findAll();
      res.json(rows);
    } catch (err) {
      console.error('Error fetching project unit budgets:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const row = await db.projectUnitBudgets.findById(req.params.id);
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(row);
    } catch (err) {
      console.error('Error fetching project unit budget by id:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const updated = await db.projectUnitBudgets.update(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      console.error('Error updating project unit budget:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async remove(req, res) {
    try {
      await db.projectUnitBudgets.remove(req.params.id);
      res.status(204).end();
    } catch (err) {
      console.error('Error deleting project unit budget:', err);
      res.status(500).json({ error: err.message });
    }
  }
};
