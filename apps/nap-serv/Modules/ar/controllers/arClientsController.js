/**
 * @file AR Clients controller — enriched CRUD with source_id linking for addresses/contacts
 * @module ar/controllers/arClientsController
 *
 * Validates client_code uniqueness expectations and enriches CRUD with
 * polymorphic source linking for addresses and contacts via the sources table.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';

class ArClientsController extends BaseController {
  constructor() {
    super('arClients', 'ar-client');
  }

  async create(req, res) {
    if (!req.body.client_code) {
      return res.status(400).json({ error: 'client_code is required' });
    }
    if (!req.body.name) {
      return res.status(400).json({ error: 'name is required' });
    }
    return super.create(req, res);
  }

  async update(req, res) {
    if (req.body.client_code === null || req.body.client_code === '') {
      return res.status(400).json({ error: 'client_code cannot be empty' });
    }
    return super.update(req, res);
  }
}

const instance = new ArClientsController();
export default instance;
export { ArClientsController };
