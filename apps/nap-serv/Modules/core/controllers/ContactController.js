

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

const ContactController = {
  async create(req, res) {
    try {
      const contact = await db.contacts.insert(req.body);
      res.status(201).json(contact);
    } catch (err) {
      console.error('Error creating contact:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getAll(req, res) {
    try {
      const contacts = await db.contacts.findAll();
      res.json(contacts);
    } catch (err) {
      console.error('Error fetching contacts:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const contact = await db.contacts.findById(req.params.id);
      if (!contact) {
        return res.status(404).json({ error: 'Not found' });
      }
      res.json(contact);
    } catch (err) {
      console.error('Error fetching contact by ID:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const updated = await db.contacts.update(req.params.id, req.body);
      res.json(updated);
    } catch (err) {
      console.error('Error updating contact:', err);
      res.status(500).json({ error: err.message });
    }
  },

  async remove(req, res) {
    try {
      await db.contacts.remove(req.params.id);
      res.status(204).send();
    } catch (err) {
      console.error('Error deleting contact:', err);
      res.status(500).json({ error: err.message });
    }
  }
};

export default ContactController;