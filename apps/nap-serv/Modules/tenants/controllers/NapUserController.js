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

export const NapUserController = {
  async create(req, res) {
    try {
      const user = await db.napUsers.insert(req.body);
      res.status(201).json(user);
    } catch (err) {
      console.error('Error inserting user:', err);
      res.status(400).json({ error: err.message });
    }
  },

  async getAll(req, res) {
    try {
      const users = await db.napUsers.findAll();
      res.json(users);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const user = await db.napUsers.findById(req.params.id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json(user);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const user = await db.napUsers.update(req.params.id, req.body);
      res.json(user);
    } catch (err) {
      console.error('Error updating user:', err);
      
      res.status(400).json({ error: err.message });
    }
  },

  async remove(req, res) {
    try {
      await db.napUsers.delete(req.params.id);
      res.status(204).end();
    } catch (err) {
      console.error('Error deleting user:', err);
      
      res.status(500).json({ error: err.message });
    }
  },
};

export default NapUserController;
