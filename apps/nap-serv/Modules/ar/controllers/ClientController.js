

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

const ClientController = {
  async create(req, res) {
    try {
      const client = await db.clients.insert(req.body);
      res.status(201).json(client);
    } catch (err) {
      console.error('Error creating client:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getAll(req, res) {
    try {
      const clients = await db.clients.findAll();
      res.json(clients);
    } catch (err) {
      console.error('Error fetching clients:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const client = await db.clients.findById(req.params.id);
      if (!client) {
        return res.status(404).json({ error: 'Not found' });
      }
      res.json(client);
    } catch (err) {
      console.error('Error fetching client by ID:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const updated = await db.clients.update(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      console.error('Error updating client:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async remove(req, res) {
    try {
      await db.clients.remove(req.params.id);
      res.status(204).send();
    } catch (err) {
      console.error('Error deleting client:', err);
      res.status(500).json({ error: err.message });
    }
  }
};

export default ClientController;