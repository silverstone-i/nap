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

export const ActivityController = {
  async create(req, res) {    
    try {
      const activity = await db.activities.insert(req.body);
      res.status(201).json(activity);
    } catch (err) {
      console.error('Error creating activity:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getAll(req, res) {
    try {
      const activities = await db.activities.findAll();
      res.json(activities);
    } catch (err) {
      console.error('Error fetching activities:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const activity = await db.activities.findById(req.params.id);
      if (!activity)
        return res.status(404).json({ error: 'Activity not found' });
      res.json(activity);
    } catch (err) {
      console.error('Error fetching activity:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const updated = await db.activities.update(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      console.error('Error updating activity:', err);
      res.status(500).json({ error: err.message });
    }
  },
  async remove(req, res) {
    try {
      // Check if the activity exists before attempting to delete
      const activity = await db.activities.findById(req.params.id);
      if (!activity)
        return res.status(404).json({ error: 'Activity not found' });

      // Proceed to delete the activity
      await db.activities.delete(req.params.id);
      res.status(204).end();
    } catch (err) {
      console.error('Error deleting activity:', err);
      res.status(500).json({ error: err.message });
    }
  },
};

export default ActivityController;
