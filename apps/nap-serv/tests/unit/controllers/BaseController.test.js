import { describe, it, vi, beforeEach, expect } from 'vitest';
import BaseController from '../../../src/controllers/BaseController.js';

describe('BaseController', () => {
  let controller, modelMock, req, res;

  beforeEach(() => {
    modelMock = {
      insert: vi.fn(),
      findWhere: vi.fn(),
      findById: vi.fn(),
      updateWhere: vi.fn(),
    };

    controller = new BaseController(modelMock, 'TestModel');

    req = { body: {}, query: {}, params: {} };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
  });

  it('should create a new record', async () => {
    modelMock.insert.mockResolvedValue({ id: 1 });
    req.body = { name: 'test' };

    await controller.create(req, res);

    expect(modelMock.insert).toHaveBeenCalledWith({ name: 'test' });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: 1 });
  });

  it('should fetch records with query filters', async () => {
    modelMock.findWhere.mockResolvedValue([{ id: 1 }]);
    req.query = { is_active: true };

    await controller.get(req, res);

    expect(modelMock.findWhere).toHaveBeenCalledWith([{ is_active: true }]);
    expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
  });

  it('should fetch a record by ID', async () => {
    modelMock.findById.mockResolvedValue({ id: 1 });
    req.params.id = 1;

    await controller.getById(req, res);

    expect(modelMock.findById).toHaveBeenCalledWith(1);
    expect(res.json).toHaveBeenCalledWith({ id: 1 });
  });

  it('should return 404 if getById finds nothing', async () => {
    modelMock.findById.mockResolvedValue(null);
    req.params.id = 99;

    await controller.getById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ error: 'TestModel not found' });
  });

  it('should update a record', async () => {
    modelMock.updateWhere.mockResolvedValue({ id: 1 });
    req.query = { id: 1 };
    req.body = { name: 'Updated' };

    await controller.update(req, res);

    expect(modelMock.updateWhere).toHaveBeenCalledWith([{ id: 1 }], { name: 'Updated' });
    expect(res.json).toHaveBeenCalledWith({ id: 1 });
  });

  it('should soft delete a record', async () => {
    modelMock.updateWhere.mockResolvedValue(true);
    req.query = { id: 1 };

    await controller.remove(req, res);

    expect(modelMock.updateWhere).toHaveBeenCalledWith([{ is_active: true }, { id: 1 }], { is_active: false });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'TestModel marked as inactive' });
  });

  it('should restore a record', async () => {
    modelMock.updateWhere.mockResolvedValue(true);
    req.query = { id: 1 };

    await controller.restore(req, res);

    expect(modelMock.updateWhere).toHaveBeenCalledWith([{ is_active: false }, { id: 1 }], { is_active: true });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ message: 'TestModel marked as active' });
  });
});
