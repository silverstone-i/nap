import { jest } from '@jest/globals';
import { ActivityController } from '../../../modules/activities/controllers/ActivityController.js';
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

describe('ActivityController', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.end = jest.fn();
    return res;
  };

  beforeEach(() => {
    db.activities = {
      insert: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('should insert an activity and return 201', async () => {
      const req = {
        body: {
          name: 'Test Activity',
          created_by: 'Tester',
        },
      };
      const res = mockRes();
      db.activities.insert.mockResolvedValue(req.body);

      await ActivityController.create(req, res);

      expect(db.activities.insert).toHaveBeenCalledWith(req.body);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(req.body);
    });

    it('should handle insertion error', async () => {
      const req = { body: {} };
      const res = mockRes();
      db.activities.insert.mockRejectedValue(new Error('Insert error'));

      await ActivityController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Insert error' });
    });
  });

  describe('getAll', () => {
    it('should return all activities', async () => {
      const req = {};
      const res = mockRes();
      const activities = [{ id: 1 }, { id: 2 }];
      db.activities.findAll.mockResolvedValue(activities);

      await ActivityController.getAll(req, res);

      expect(res.json).toHaveBeenCalledWith(activities);
    });

    it('should handle error on getAll', async () => {
      const req = {};
      const res = mockRes();
      db.activities.findAll.mockRejectedValue(new Error('Find error'));

      await ActivityController.getAll(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Find error' });
    });
  });

  describe('getById', () => {
    it('should return activity by ID', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      const activity = { id: 'abc' };
      db.activities.findById.mockResolvedValue(activity);

      await ActivityController.getById(req, res);

      expect(res.json).toHaveBeenCalledWith(activity);
    });

    it('should return 404 if activity not found', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      db.activities.findById.mockResolvedValue(null);

      await ActivityController.getById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Activity not found' });
    });

    it('should handle error on getById', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      db.activities.findById.mockRejectedValue(new Error('Find error'));

      await ActivityController.getById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Find error' });
    });
  });

  describe('update', () => {
    it('should update and return activity', async () => {
      const req = { params: { id: 'abc' }, body: { name: 'Updated' } };
      const res = mockRes();
      const updatedActivity = { id: 'abc', name: 'Updated' };
      db.activities.update.mockResolvedValue(updatedActivity);

      await ActivityController.update(req, res);

      expect(db.activities.update).toHaveBeenCalledWith('abc', { name: 'Updated' });
      expect(res.json).toHaveBeenCalledWith(updatedActivity);
    });

    it('should handle update error', async () => {
      const req = { params: { id: 'abc' }, body: {} };
      const res = mockRes();
      db.activities.update.mockRejectedValue(new Error('Update error'));

      await ActivityController.update(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Update error' });
    });
  });

  describe('remove', () => {
    it('should delete activity and return 204', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      db.activities.findById.mockResolvedValue({ id: 'abc' });
      db.activities.delete.mockResolvedValue();

      await ActivityController.remove(req, res);

      expect(db.activities.delete).toHaveBeenCalledWith('abc');
      expect(res.status).toHaveBeenCalledWith(204);
      expect(res.end).toHaveBeenCalled();
    });

    it('should handle delete error', async () => {
      const req = { params: { id: 'abc' } };
      const res = mockRes();
      db.activities.findById.mockResolvedValue({ id: 'abc' });
      db.activities.delete.mockRejectedValue(new Error('Delete error'));

      await ActivityController.remove(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'Delete error' });
    });
  });
});