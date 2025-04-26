

import { jest } from '@jest/globals';
import TenantController from '../../../modules/tenants/controllers/TenantController.js';
import { db } from '../../../src/db/db.js';

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  console.log.mockRestore();
  console.error.mockRestore();
});

jest.mock('../../../src/db/db.js');

describe('TenantController', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.end = jest.fn();
    return res;
  };

  beforeEach(() => {
    db.tenants = {
      insert: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('should insert a tenant and return 201', async () => {
      const req = { body: { name: 'Tenant A' } };
      const res = mockRes();
      db.tenants.insert.mockResolvedValue(req.body);

      await TenantController.create(req, res);

      expect(db.tenants.insert).toHaveBeenCalledWith(req.body);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(req.body);
    });

    it('should handle insertion error', async () => {
      const req = { body: {} };
      const res = mockRes();
      db.tenants.insert.mockRejectedValue(new Error('Insert error'));

      await TenantController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Insert error' });
    });
  });

  describe('getAll', () => {
    it('should return all tenants', async () => {
      const req = {};
      const res = mockRes();
      const tenants = [{ id: 1 }, { id: 2 }];
      db.tenants.findAll.mockResolvedValue(tenants);

      await TenantController.getAll(req, res);

      expect(res.json).toHaveBeenCalledWith(tenants);
    });

    it('should handle error on getAll', async () => {
      const req = {};
      const res = mockRes();
      db.tenants.findAll.mockRejectedValue(new Error('Find error'));

      await TenantController.getAll(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Find error' });
    });
  });

  describe('getById', () => {
    it('should return tenant by ID', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      const tenant = { id: 'abc' };
      db.tenants.findById.mockResolvedValue(tenant);

      await TenantController.getById(req, res);

      expect(res.json).toHaveBeenCalledWith(tenant);
    });

    it('should return 404 if tenant not found', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      db.tenants.findById.mockResolvedValue(null);

      await TenantController.getById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Tenant not found' });
    });

    it('should handle error on getById', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      db.tenants.findById.mockRejectedValue(new Error('Find error'));

      await TenantController.getById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Find error' });
    });
  });

  describe('update', () => {
    it('should update and return tenant', async () => {
      const req = { params: { id: 'abc' }, body: { name: 'Updated Tenant' } };
      const res = mockRes();
      const updatedTenant = { id: 'abc', name: 'Updated Tenant' };
      db.tenants.update.mockResolvedValue(updatedTenant);

      await TenantController.update(req, res);

      expect(db.tenants.update).toHaveBeenCalledWith('abc', { name: 'Updated Tenant' });
      expect(res.json).toHaveBeenCalledWith(updatedTenant);
    });

    it('should handle update error', async () => {
      const req = { params: { id: 'abc' }, body: {} };
      const res = mockRes();
      db.tenants.update.mockRejectedValue(new Error('Update error'));

      await TenantController.update(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Update error' });
    });
  });

  describe('remove', () => {
    it('should delete tenant and return 204', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      db.tenants.delete.mockResolvedValue();

      await TenantController.remove(req, res);

      expect(db.tenants.delete).toHaveBeenCalledWith('abc');
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
    });

    it('should handle delete error', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      db.tenants.delete.mockRejectedValue(new Error('Delete error'));

      await TenantController.remove(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Delete error' });
    });
  });

  describe('getAllAllowedModules', () => {
    it('should return allowed modules', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      const tenant = { id: 'abc', allowed_modules: ['accounting', 'projects'] };
      db.tenants.findById.mockResolvedValue(tenant);

      await TenantController.getAllAllowedModules(req, res);

      expect(db.tenants.findById).toHaveBeenCalledWith('abc');
      expect(res.json).toHaveBeenCalledWith({ allowed_modules: ['accounting', 'projects'] });
    });

    it('should return 404 if tenant not found', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      db.tenants.findById.mockResolvedValue(null);

      await TenantController.getAllAllowedModules(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Tenant not found' });
    });

    it('should handle error on getAllAllowedModules', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      db.tenants.findById.mockRejectedValue(new Error('Find error'));

      await TenantController.getAllAllowedModules(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Find error' });
    });
  });
});