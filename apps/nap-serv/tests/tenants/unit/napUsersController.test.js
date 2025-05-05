import { jest } from '@jest/globals';
import NapUsersController from '../../../modules/tenants/controllers/NapUsersController.js';
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

describe('NapUsersController', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.end = jest.fn();
    return res;
  };

  beforeEach(() => {
    db.napUsers = {
      insert: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('should insert a user and return 201', async () => {
      const req = {
        body: {
          email: 'test@example.com',
          password_hash: 'secret',
          created_by: 'Test',
        },
      };
      const res = mockRes();
      db.napUsers.insert.mockResolvedValue(req.body);

      await NapUsersController.create(req, res);

      expect(db.napUsers.insert).toHaveBeenCalledWith(req.body);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(req.body);
    });

    it('should handle insertion error', async () => {
      const req = { body: {} };
      const res = mockRes();
      db.napUsers.insert.mockRejectedValue(new Error('Insert error'));

      await NapUsersController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Insert error' });
    });
  });

  describe('getAll', () => {
    it('should return all users', async () => {
      const req = {};
      const res = mockRes();
      const users = [{ id: 1 }, { id: 2 }];
      db.napUsers.findAll.mockResolvedValue(users);

      await NapUsersController.getAll(req, res);

      expect(res.json).toHaveBeenCalledWith(users);
    });

    it('should handle error on getAll', async () => {
      const req = {};
      const res = mockRes();
      db.napUsers.findAll.mockRejectedValue(new Error('Find error'));

      await NapUsersController.getAll(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Find error' });
    });
  });

  describe('getById', () => {
    it('should return user by ID', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      const user = { id: 'abc' };
      db.napUsers.findById.mockResolvedValue(user);

      await NapUsersController.getById(req, res);

      expect(res.json).toHaveBeenCalledWith(user);
    });

    it('should return 404 if user not found', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      db.napUsers.findById.mockResolvedValue(null);

      await NapUsersController.getById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('should handle error on getById', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      db.napUsers.findById.mockRejectedValue(new Error('Find error'));

      await NapUsersController.getById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Find error' });
    });
  });

  describe('update', () => {
    it('should update and return user', async () => {
      const req = { params: { id: 'abc' }, body: { email: 'updated' } };
      const res = mockRes();
      const updatedUser = { id: 'abc', email: 'updated' };
      db.napUsers.update.mockResolvedValue(updatedUser);

      await NapUsersController.update(req, res);

      expect(db.napUsers.update).toHaveBeenCalledWith('abc', { email: 'updated' });
      expect(res.json).toHaveBeenCalledWith(updatedUser);
    });

    it('should handle update error', async () => {
      const req = { params: { id: 'abc' }, body: {} };
      const res = mockRes();
      db.napUsers.update.mockRejectedValue(new Error('Update error'));

      await NapUsersController.update(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Update error' });
    });
  });

  describe('remove', () => {
    it('should delete user and return 204', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      db.napUsers.delete.mockResolvedValue();

      await NapUsersController.remove(req, res);

      expect(db.napUsers.delete).toHaveBeenCalledWith('abc');
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
    });

    it('should handle delete error', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      db.napUsers.delete.mockRejectedValue(new Error('Delete error'));

      await NapUsersController.remove(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Delete error' });
    });
  });
});
