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
      res.json(tenant);
    } catch (err) {
      console.error('Error updating tenant:', err);
      
      res.status(400).json({ error: err.message });
    }
  },

  async remove(req, res) {
    console.log('Deleting tenant with ID:', req.params.id);
    
    try {
      await db.tenants.delete(req.params.id);
      res.status(204).end();
    } catch (err) {
      console.error('Error deleting tenant:', err);
      
      res.status(500).json({ error: err.message });
    }
  },

  async getAllAllowedModules(req, res) {
    console.log('Fetching allowed modules for tenant ID:', req.params.id);
    
    try {
      const tenant = await db.tenants.findById(req.params.id);
      if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
      console.log('Tenant allowed modules:', tenant.allowed_modules);
      
      res.json({ allowed_modules: tenant.allowed_modules });
    } catch (err) {
      console.error('Error fetching allowed modules:', err);
      
      res.status(500).json({ error: err.message });
    }
  },
};

export default TenantController;
