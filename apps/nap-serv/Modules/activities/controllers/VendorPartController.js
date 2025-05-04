

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

const VendorPartsController = {
  async create(req, res) {
    try {
      const part = await db.vendorParts.insert(req.body);
      res.status(201).json(part);
    } catch (err) {
      console.error('Error creating vendor part:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getAll(req, res) {
    try {
      const parts = await db.vendorParts.findAll();
      res.json(parts);
    } catch (err) {
      console.error('Error fetching vendor parts:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const part = await db.vendorParts.findById(req.params.id);
      if (!part) {
        return res.status(404).json({ error: 'Vendor part not found' });
      }
      res.json(part);
    } catch (err) {
      console.error('Error fetching vendor part by ID:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const updated = await db.vendorParts.update(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      console.error('Error updating vendor part:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async remove(req, res) {
    try {
      await db.vendorParts.delete(req.params.id);
      res.status(204).end();
    } catch (err) {
      console.error('Error deleting vendor part:', err);
      res.status(500).json({ error: err.message });
    }
  }
};

export default VendorPartsController;