


import { jest } from '@jest/globals';
import { VendorController } from '../../../modules/core/controllers/VendorController.js';
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

describe('VendorController', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.end = jest.fn();
    return res;
  };

  beforeEach(() => {
    db.vendors = {
      insert: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('should insert a vendor and return 201', async () => {
      const req = { body: { name: 'Test Vendor', created_by: 'Tester' } };
      const res = mockRes();
      db.vendors.insert.mockResolvedValue(req.body);

      await VendorController.create(req, res);

      expect(db.vendors.insert).toHaveBeenCalledWith(req.body);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(req.body);
    });

    it('should handle insertion error', async () => {
      const req = { body: {} };
      const res = mockRes();
      db.vendors.insert.mockRejectedValue(new Error('Insert error'));

      await VendorController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Insert error' });
    });
  });

  describe('getAll', () => {
    it('should return all vendors', async () => {
      const req = {};
      const res = mockRes();
      const vendors = [{ id: 1 }, { id: 2 }];
      db.vendors.findAll.mockResolvedValue(vendors);

      await VendorController.getAll(req, res);

      expect(res.json).toHaveBeenCalledWith(vendors);
    });

    it('should handle error on getAll', async () => {
      const req = {};
      const res = mockRes();
      db.vendors.findAll.mockRejectedValue(new Error('Find error'));

      await VendorController.getAll(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Find error' });
    });
  });

  describe('getById', () => {
    it('should return vendor by ID', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      const vendor = { id: 'abc' };
      db.vendors.findById.mockResolvedValue(vendor);

      await VendorController.getById(req, res);

      expect(res.json).toHaveBeenCalledWith(vendor);
    });

    it('should return 404 if vendor not found', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      db.vendors.findById.mockResolvedValue(null);

      await VendorController.getById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Vendor not found' });
    });

    it('should handle error on getById', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      db.vendors.findById.mockRejectedValue(new Error('Find error'));

      await VendorController.getById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Find error' });
    });
  });

  describe('update', () => {
    it('should update and return vendor', async () => {
      const req = { params: { id: 'abc' }, body: { name: 'Updated' } };
      const res = mockRes();
      const updatedVendor = { id: 'abc', name: 'Updated' };
      db.vendors.update.mockResolvedValue(updatedVendor);

      await VendorController.update(req, res);

      expect(db.vendors.update).toHaveBeenCalledWith('abc', { name: 'Updated' });
      expect(res.json).toHaveBeenCalledWith(updatedVendor);
    });

    it('should handle update error', async () => {
      const req = { params: { id: 'abc' }, body: {} };
      const res = mockRes();
      db.vendors.update.mockRejectedValue(new Error('Update error'));

      await VendorController.update(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Update error' });
    });
  });

  describe('remove', () => {
    it('should delete vendor and return 204', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      db.vendors.findById.mockResolvedValue({ id: 'abc' });
      db.vendors.delete.mockResolvedValue();

      await VendorController.remove(req, res);

      expect(db.vendors.delete).toHaveBeenCalledWith('abc');
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
    });

    it('should handle delete error', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      db.vendors.findById.mockResolvedValue({ id: 'abc' });
      db.vendors.delete.mockRejectedValue(new Error('Delete error'));

      await VendorController.remove(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Delete error' });
    });
  });
});