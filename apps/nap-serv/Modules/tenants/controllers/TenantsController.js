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

const TenantController = {
  async create(req, res) {
    try {
      const tenant = await db.tenants.insert(req.body);

      console.log('Tenant created with id:', tenant.id);
      

      res.status(201).json(tenant);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },

  async getAll(req, res) {
    try {
      const tenants = await db.tenants.findAll();

      res.json(tenants);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async getById(req, res) {
    try {
      const tenant = await db.tenants.findById(req.params.id);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
      res.json(tenant);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async update(req, res) {
    try {
      const tenant = await db.tenants.update(req.params.id, req.body);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
      res.json(tenant);
    } catch (err) {
      console.error('Error updating tenant:', err);
      res.status(400).json({ error: err.message });
    }
  },

  async remove(req, res) {
    try {
      const deleted = await db.tenants.delete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Tenant not found' });
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  },

  async getAllAllowedModules(req, res) {
    console.log('Fetching allowed modules for tenant ID:', req.params.id);
    
    try {
      const allowedModules = await db.tenants.getAllowedModulesById(req.params.id);
      if (!allowedModules) return res.status(404).json({ error: 'Tenant not found' });
      res.json({ allowed_modules: allowedModules });
    } catch (err) {
      console.error('Error fetching allowed modules:', err);
      res.status(500).json({ error: err.message });
    }
  },
};

export default TenantController;
