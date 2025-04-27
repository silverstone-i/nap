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

const CostLineController = {
  async create(req, res) {
    try {
      const costLine = await db.costLines.insert(req.body);
      res.status(201).json(costLine);
    } catch (err) {
      console.error('Error creating cost line:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getAll(req, res) {
    try {
      const costLines = await db.costLines.findAll();
      res.json(costLines);
    } catch (err) {
      console.error('Error fetching cost lines:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const costLine = await db.costLines.findById(req.params.id);
      if (!costLine)
        return res.status(404).json({ error: 'Cost line not found' });
      res.json(costLine);
    } catch (err) {
      console.error('Error fetching cost line:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const updated = await db.costLines.update(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      console.error('Error updating cost line:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async remove(req, res) {
    try {
      // Check if the costLine exists before attempting to delete
      const costLine = await db.costLines.findById(req.params.id);
      if (!costLine)
        return res.status(404).json({ error: 'Cost line not found' });

      await db.costLines.delete(req.params.id);
      res.status(204).end();
    } catch (err) {
      console.error('Error deleting cost line:', err);
      res.status(500).json({ error: err.message });
    }
  },
};

export default CostLineController;
