

'use strict';

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../src/db/db.js', () => ({
  db: {
    tenant: {
      insert: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      deleteById: jest.fn(),
    },
  },
}));

let TenantController, db;
beforeAll(async () => {
  ({ db } = await import('../../../src/db/db.js'));
  TenantController = (await import('../../../modules/tenants/controllers/TenantController.js')).default;
});

describe('TenantController', () => {
  let req, res;

  beforeEach(() => {
    req = { params: {}, body: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      end: jest.fn(),
    };
    db.tenant.insert.mockReset();
    db.tenant.findAll.mockReset();
    db.tenant.findById.mockReset();
    db.tenant.update.mockReset();
    db.tenant.deleteById.mockReset();
  });

  describe('create', () => {
    it('should create a tenant and return 201', async () => {
      const mockTenant = { id: '1', name: 'Tenant A' };
      db.tenant.insert.mockResolvedValue(mockTenant);

      req.body = { name: 'Tenant A' };
      await TenantController.create(req, res);

      expect(db.tenant.insert).toHaveBeenCalledWith(req.body);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockTenant);
    });

    it('should handle errors during create', async () => {
      db.tenant.insert.mockRejectedValue(new Error('Insert failed'));

      await TenantController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Insert failed' });
    });
  });

  describe('getAll', () => {
    it('should return all tenants', async () => {
      const tenants = [{ id: '1' }, { id: '2' }];
      db.tenant.findAll.mockResolvedValue(tenants);

      await TenantController.getAll(req, res);

      expect(db.tenant.findAll).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(tenants);
    });

    it('should handle errors during getAll', async () => {
      db.tenant.findAll.mockRejectedValue(new Error('Fetch failed'));

      await TenantController.getAll(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Fetch failed' });
    });
  });

  describe('getById', () => {
    it('should return a tenant by id', async () => {
      const tenant = { id: '1' };
      db.tenant.findById.mockResolvedValue(tenant);

      req.params.id = '1';
      await TenantController.getById(req, res);

      expect(db.tenant.findById).toHaveBeenCalledWith('1');
      expect(res.json).toHaveBeenCalledWith(tenant);
    });

    it('should return 404 if tenant not found', async () => {
      db.tenant.findById.mockResolvedValue(null);

      req.params.id = '1';
      await TenantController.getById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Tenant not found' });
    });

    it('should handle errors during getById', async () => {
      db.tenant.findById.mockRejectedValue(new Error('Fetch failed'));

      await TenantController.getById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Fetch failed' });
    });
  });

  describe('update', () => {
    it('should update a tenant and return it', async () => {
      const updatedTenant = { id: '1', name: 'Updated Tenant' };
      db.tenant.update.mockResolvedValue(updatedTenant);

      req.params.id = '1';
      req.body = { name: 'Updated Tenant' };
      await TenantController.update(req, res);

      expect(db.tenant.update).toHaveBeenCalledWith('1', req.body);
      expect(res.json).toHaveBeenCalledWith(updatedTenant);
    });

    it('should handle errors during update', async () => {
      db.tenant.update.mockRejectedValue(new Error('Update failed'));

      await TenantController.update(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Update failed' });
    });
  });

  describe('remove', () => {
    it('should remove a tenant and return 204', async () => {
      db.tenant.deleteById.mockResolvedValue();

      req.params.id = '1';
      await TenantController.remove(req, res);

      expect(db.tenant.deleteById).toHaveBeenCalledWith('1');
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
    });

    it('should handle errors during remove', async () => {
      db.tenant.deleteById.mockRejectedValue(new Error('Delete failed'));

      await TenantController.remove(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Delete failed' });
    });
  });

  describe('getAllAllowedModules', () => {
    it('should return allowed modules for tenant', async () => {
      const tenant = { id: '1', allowed_modules: ['accounting', 'projects'] };
      db.tenant.findById.mockResolvedValue(tenant);

      req.params.id = '1';
      await TenantController.getAllAllowedModules(req, res);

      expect(db.tenant.findById).toHaveBeenCalledWith('1');
      expect(res.json).toHaveBeenCalledWith({ allowed_modules: tenant.allowed_modules });
    });

    it('should return 404 if tenant not found in getAllAllowedModules', async () => {
      db.tenant.findById.mockResolvedValue(null);

      req.params.id = '1';
      await TenantController.getAllAllowedModules(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Tenant not found' });
    });

    it('should handle errors during getAllAllowedModules', async () => {
      db.tenant.findById.mockRejectedValue(new Error('Fetch failed'));

      await TenantController.getAllAllowedModules(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Fetch failed' });
    });
  });
});