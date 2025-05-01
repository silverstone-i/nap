

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

const ActivityActualController = {
  async create(req, res) {
    try {
      const actual = await db.activityActuals.insert(req.body);
      res.status(201).json(actual);
    } catch (err) {
      console.error('Error creating activity actual:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getAll(req, res) {
    try {
      const actuals = await db.activityActuals.findAll();
      res.json(actuals);
    } catch (err) {
      console.error('Error fetching activity actuals:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const actual = await db.activityActuals.findById(req.params.id);
      if (!actual) {
        return res.status(404).json({ error: 'Not found' });
      }
      res.json(actual);
    } catch (err) {
      console.error('Error fetching activity actual by ID:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const updated = await db.activityActuals.update(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      console.error('Error updating activity actual:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async remove(req, res) {
    try {
      await db.activityActuals.remove(req.params.id);
      res.status(204).send();
    } catch (err) {
      console.error('Error deleting activity actual:', err);
      res.status(500).json({ error: err.message });
    }
  }
};

export default ActivityActualController;