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

export const VendorController = {
  async create(req, res) {
    try {
      const vendor = await db.vendors.insert(req.body);
      res.status(201).json(vendor);
    } catch (err) {
      console.error('Error creating vendor:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getAll(req, res) {
    try {
      const vendors = await db.vendors.findAll();
      res.json(vendors);
    } catch (err) {
      console.error('Error fetching vendors:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const vendor = await db.vendors.findById(req.params.id);
      if (!vendor)
        return res.status(404).json({ error: 'Vendor not found' });
      res.json(vendor);
    } catch (err) {
      console.error('Error fetching vendor:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const updated = await db.vendors.update(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: 'Vendor not found' });
      }
      res.json(updated);
    } catch (err) {
      console.error('Error updating vendor:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async remove(req, res) {
    try {
      const deleted = await db.vendors.delete(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Vendor not found' });
      }
      res.status(204).end();
    } catch (err) {
      console.error('Error deleting vendor:', err);
      res.status(500).json({ error: err.message });
    }
  },
};

export default VendorController;