


import { jest } from '@jest/globals';
import { CategoryController } from '../../../modules/activities/controllers/CategoryController.js';
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

describe('CategoryController', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.end = jest.fn();
    return res;
  };

  beforeEach(() => {
    db.categories = {
      insert: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('should insert a category and return 201', async () => {
      const req = { body: { name: 'Test Category', created_by: 'Tester' } };
      const res = mockRes();
      db.categories.insert.mockResolvedValue(req.body);

      await CategoryController.create(req, res);

      expect(db.categories.insert).toHaveBeenCalledWith(req.body);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(req.body);
    });

    it('should handle insertion error', async () => {
      const req = { body: {} };
      const res = mockRes();
      db.categories.insert.mockRejectedValue(new Error('Insert error'));

      await CategoryController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Insert error' });
    });
  });

  describe('getAll', () => {
    it('should return all categories', async () => {
      const req = {};
      const res = mockRes();
      const categories = [{ id: 1 }, { id: 2 }];
      db.categories.findAll.mockResolvedValue(categories);

      await CategoryController.getAll(req, res);

      expect(res.json).toHaveBeenCalledWith(categories);
    });

    it('should handle error on getAll', async () => {
      const req = {};
      const res = mockRes();
      db.categories.findAll.mockRejectedValue(new Error('Find error'));

      await CategoryController.getAll(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Find error' });
    });
  });

  describe('getById', () => {
    it('should return category by ID', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      const category = { id: 'abc' };
      db.categories.findById.mockResolvedValue(category);

      await CategoryController.getById(req, res);

      expect(res.json).toHaveBeenCalledWith(category);
    });

    it('should return 404 if category not found', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      db.categories.findById.mockResolvedValue(null);

      await CategoryController.getById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Category not found' });
    });

    it('should handle error on getById', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      db.categories.findById.mockRejectedValue(new Error('Find error'));

      await CategoryController.getById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Find error' });
    });
  });

  describe('update', () => {
    it('should update and return category', async () => {
      const req = { params: { id: 'abc' }, body: { name: 'Updated' } };
      const res = mockRes();
      const updatedCategory = { id: 'abc', name: 'Updated' };
      db.categories.update.mockResolvedValue(updatedCategory);

      await CategoryController.update(req, res);

      expect(db.categories.update).toHaveBeenCalledWith('abc', { name: 'Updated' });
      expect(res.json).toHaveBeenCalledWith(updatedCategory);
    });

    it('should handle update error', async () => {
      const req = { params: { id: 'abc' }, body: {} };
      const res = mockRes();
      db.categories.update.mockRejectedValue(new Error('Update error'));

      await CategoryController.update(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Update error' });
    });
  });

  describe('remove', () => {
    it('should delete category and return 204', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      db.categories.findById.mockResolvedValue({ id: 'abc' });
      db.categories.delete.mockResolvedValue();

      await CategoryController.remove(req, res);

      expect(db.categories.delete).toHaveBeenCalledWith('abc');
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
    });

    it('should handle delete error', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      db.categories.findById.mockResolvedValue({ id: 'abc' });
      db.categories.delete.mockRejectedValue(new Error('Delete error'));

      await CategoryController.remove(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Delete error' });
    });
  });
});