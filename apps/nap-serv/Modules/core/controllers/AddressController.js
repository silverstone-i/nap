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

const AddressController = {
  async create(req, res) {
    try {
      const address = await db.addresses.insert(req.body);
      res.status(201).json(address);
    } catch (err) {
      console.error('Error creating address:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getAll(req, res) {
    try {
      const addresses = await db.addresses.findAll();
      res.json(addresses);
    } catch (err) {
      console.error('Error fetching addresses:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const address = await db.addresses.findById(req.params.id);
      if (!address) {
        return res.status(404).json({ error: 'Not found' });
      }
      res.json(address);
    } catch (err) {
      console.error('Error fetching address by ID:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const updated = await db.addresses.update(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: 'Not found' });
      }
      res.json(updated);
    } catch (err) {
      console.error('Error updating address:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async remove(req, res) {
    try {
      const removed = await db.addresses.remove(req.params.id);
      if (!removed) {
        return res.status(404).json({ error: 'Not found' });
      }
      res.status(204).send();
    } catch (err) {
      console.error('Error deleting address:', err);
      res.status(500).json({ error: err.message });
    }
  }
};

export default AddressController;