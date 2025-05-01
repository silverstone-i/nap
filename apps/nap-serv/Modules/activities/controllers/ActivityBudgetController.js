

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

const ActivityBudgetController = {
  async create(req, res) {
    try {
      const budget = await db.activityBudgets.insert(req.body);
      res.status(201).json(budget);
    } catch (err) {
      console.error('Error creating activity budget:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getAll(req, res) {
    try {
      const budgets = await db.activityBudgets.findAll();
      res.json(budgets);
    } catch (err) {
      console.error('Error fetching activity budgets:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const budget = await db.activityBudgets.findById(req.params.id);
      if (!budget) {
        return res.status(404).json({ error: 'Not found' });
      }
      res.json(budget);
    } catch (err) {
      console.error('Error fetching activity budget by ID:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const updated = await db.activityBudgets.update(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      console.error('Error updating activity budget:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async remove(req, res) {
    try {
      await db.activityBudgets.remove(req.params.id);
      res.status(204).send();
    } catch (err) {
      console.error('Error deleting activity budget:', err);
      res.status(500).json({ error: err.message });
    }
  }
};

export default ActivityBudgetController;