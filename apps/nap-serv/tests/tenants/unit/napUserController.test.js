'use strict';

import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../src/db/db.js', () => ({
  db: {
    napUser: {
      insert: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteById: jest.fn(),
    },
  },
}));

let NapUserController, db;
beforeAll(async () => {
  ({ db } = await import('../../../src/db/db.js'));
  NapUserController = (await import('../../../modules/tenants/controllers/NapUserController.js')).default;
});

describe('NapUserController', () => {
  let req, res;

  beforeEach(() => {
    req = { body: {}, params: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      end: jest.fn(),
    };
    db.napUser.insert.mockReset();
  });

  describe('create', () => {
    it('should create a user and return 201', async () => {
      const mockUser = { id: 1, name: 'John Doe' };
      db.napUser.insert.mockResolvedValue(mockUser);

      req.body = { name: 'John Doe' };
      await NapUserController.create(req, res);

      expect(db.napUser.insert).toHaveBeenCalledWith(req.body);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockUser);
    });

    it('should handle errors during create', async () => {
      db.napUser.insert.mockRejectedValue(new Error('Insert failed'));

      await NapUserController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Insert failed' });
    });
  });

  describe('getAll', () => {
    it('should return all users', async () => {
      const mockUsers = [{ id: 1 }, { id: 2 }];
      db.napUser.findAll.mockResolvedValue(mockUsers);

      await NapUserController.getAll(req, res);

      expect(db.napUser.findAll).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(mockUsers);
    });

    it('should handle errors during getAll', async () => {
      db.napUser.findAll.mockRejectedValue(new Error('Fetch failed'));

      await NapUserController.getAll(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Fetch failed' });
    });
  });

  describe('getById', () => {
    it('should return a user by id', async () => {
      const mockUser = { id: 1 };
      db.napUser.findById.mockResolvedValue(mockUser);

      req.params.id = 1;
      await NapUserController.getById(req, res);

      expect(db.napUser.findById).toHaveBeenCalledWith(1);
      expect(res.json).toHaveBeenCalledWith(mockUser);
    });

    it('should return 404 if user not found', async () => {
      db.napUser.findById.mockResolvedValue(null);

      req.params.id = 1;
      await NapUserController.getById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('should handle errors during getById', async () => {
      db.napUser.findById.mockRejectedValue(new Error('Fetch failed'));

      await NapUserController.getById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Fetch failed' });
    });
  });

  describe('update', () => {
    it('should update a user and return the updated user', async () => {
      const updatedUser = { id: 1, name: 'Updated Name' };
      db.napUser.update.mockResolvedValue(updatedUser);

      req.params.id = 1;
      req.body = { name: 'Updated Name' };
      await NapUserController.update(req, res);

      expect(db.napUser.update).toHaveBeenCalledWith(1, req.body);
      expect(res.json).toHaveBeenCalledWith(updatedUser);
    });

    it('should handle errors during update', async () => {
      db.napUser.update.mockRejectedValue(new Error('Update failed'));

      await NapUserController.update(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Update failed' });
    });
  });

  describe('remove', () => {
    it('should remove a user and return 204', async () => {
      db.napUser.deleteById.mockResolvedValue();

      req.params.id = 1;
      await NapUserController.remove(req, res);

      expect(db.napUser.deleteById).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
    });

    it('should handle errors during remove', async () => {
      db.napUser.deleteById.mockRejectedValue(new Error('Remove failed'));

      await NapUserController.remove(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Remove failed' });
    });
  });
});