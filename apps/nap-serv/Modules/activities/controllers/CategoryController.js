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

export const CategoryController = {
  async create(req, res) {
    try {
      const category = await db.categories.insert(req.body);
      res.status(201).json(category);
    } catch (err) {
      console.error('Error creating category:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getAll(req, res) {
    try {
      const categories = await db.categories.findAll();
      console.log('Get all categories:', categories);
      
      res.json(categories);
    } catch (err) {
      console.error('Error fetching all categories:', err.message);
      // console.error('Error fetching all categories:', err.stack);
      res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const category = await db.categories.findById(req.params.id);
      if (!category)
        return res.status(404).json({ error: 'Category not found' });
      res.json(category);
    } catch (err) {
      console.error('Error fetching category:', err.message);
      // console.error('Error fetching category:', err.stack);
      res.status(500).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const updated = await db.categories.update(req.params.id, req.body);
      if (!updated)
        return res.status(404).json({ error: 'Category not found' });
      res.json(updated);
    } catch (err) {
      console.error('Error updating category:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async remove(req, res) {
    try {
      // Check if the category exists before attempting to delete
      const category = await db.categories.findById(req.params.id);
      if (!category)
        return res.status(404).json({ error: 'Category not found' });

      await db.categories.delete(req.params.id);
      res.status(204).end();
    } catch (err) {
      console.error('Error deleting category:', err);
      res.status(500).json({ error: err.message });
    }
  },
};

export default CategoryController;
