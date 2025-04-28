


import { jest } from '@jest/globals';
import { CostLineController } from '../../../modules/activities/controllers/CostLineController.js';
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

describe('CostLineController', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.end = jest.fn();
    return res;
  };

  beforeEach(() => {
    db.costLines = {
      insert: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('should insert a cost line and return 201', async () => {
      const req = { body: { description: 'Test Cost Line', created_by: 'Tester' } };
      const res = mockRes();
      db.costLines.insert.mockResolvedValue(req.body);

      await CostLineController.create(req, res);

      expect(db.costLines.insert).toHaveBeenCalledWith(req.body);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(req.body);
    });

    it('should handle insertion error', async () => {
      const req = { body: {} };
      const res = mockRes();
      db.costLines.insert.mockRejectedValue(new Error('Insert error'));

      await CostLineController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Insert error' });
    });
  });

  describe('getAll', () => {
    it('should return all cost lines', async () => {
      const req = {};
      const res = mockRes();
      const costLines = [{ id: 1 }, { id: 2 }];
      db.costLines.findAll.mockResolvedValue(costLines);

      await CostLineController.getAll(req, res);

      expect(res.json).toHaveBeenCalledWith(costLines);
    });

    it('should handle error on getAll', async () => {
      const req = {};
      const res = mockRes();
      db.costLines.findAll.mockRejectedValue(new Error('Find error'));

      await CostLineController.getAll(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Find error' });
    });
  });

  describe('getById', () => {
    it('should return cost line by ID', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      const costLine = { id: 'abc' };
      db.costLines.findById.mockResolvedValue(costLine);

      await CostLineController.getById(req, res);

      expect(res.json).toHaveBeenCalledWith(costLine);
    });

    it('should return 404 if cost line not found', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      db.costLines.findById.mockResolvedValue(null);

      await CostLineController.getById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Cost line not found' });
    });

    it('should handle error on getById', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      db.costLines.findById.mockRejectedValue(new Error('Find error'));

      await CostLineController.getById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Find error' });
    });
  });

  describe('update', () => {
    it('should update and return cost line', async () => {
      const req = { params: { id: 'abc' }, body: { description: 'Updated' } };
      const res = mockRes();
      const updatedCostLine = { id: 'abc', description: 'Updated' };
      db.costLines.update.mockResolvedValue(updatedCostLine);

      await CostLineController.update(req, res);

      expect(db.costLines.update).toHaveBeenCalledWith('abc', { description: 'Updated' });
      expect(res.json).toHaveBeenCalledWith(updatedCostLine);
    });

    it('should handle update error', async () => {
      const req = { params: { id: 'abc' }, body: {} };
      const res = mockRes();
      db.costLines.update.mockRejectedValue(new Error('Update error'));

      await CostLineController.update(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Update error' });
    });
  });

  describe('remove', () => {
    it('should delete cost line and return 204', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      db.costLines.findById.mockResolvedValue({ id: 'abc' });
      db.costLines.delete.mockResolvedValue();

      await CostLineController.remove(req, res);

      expect(db.costLines.delete).toHaveBeenCalledWith('abc');
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
    });

    it('should handle delete error', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      db.costLines.findById.mockResolvedValue({ id: 'abc' });
      db.costLines.delete.mockRejectedValue(new Error('Delete error'));

      await CostLineController.remove(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Delete error' });
    });
  });
});