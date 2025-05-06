

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

export const CategoriesAccountMapController = {
  async create(req, res) {
    try {
      const record = await db.categoriesAccountMap.insert(req.body);
      res.status(201).json(record);
    } catch (err) {
      console.error('Error creating category-account map:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getAll(req, res) {
    try {
      const records = await db.categoriesAccountMap.findAll();
      res.json(records);
    } catch (err) {
      console.error('Error fetching category-account mappings:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const record = await db.categoriesAccountMap.findById(req.params.id);
      if (!record) return res.status(404).json({ error: 'Mapping not found' });
      res.json(record);
    } catch (err) {
      console.error('Error fetching mapping:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const updated = await db.categoriesAccountMap.update(req.params.id, req.body);
      if (!updated) return res.status(404).json({ error: 'Mapping not found' });
      res.json(updated);
    } catch (err) {
      console.error('Error updating mapping:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async remove(req, res) {
    try {
      const deleted = await db.categoriesAccountMap.delete(req.params.id);
      if (deleted === 0) return res.status(404).json({ error: 'Mapping not found' });
      res.status(204).end();
    } catch (err) {
      console.error('Error deleting mapping:', err);
      res.status(500).json({ error: err.message });
    }
  },
};

export default CategoriesAccountMapController;