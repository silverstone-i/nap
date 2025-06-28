vi.mock('../../../src/db/db.js', () => ({
  db: { TestModel: {} },
}));

import { db } from '../../../src/db/db.js';
import { describe, it, vi, beforeEach, expect } from 'vitest';
import BaseController from '../../../src/utils/BaseController.js';

describe('BaseController', () => {
  let controller, modelMock, req, res;

  beforeEach(() => {
    modelMock = {
      insert: vi.fn(),
      findWhere: vi.fn(),
      findById: vi.fn(),
      updateWhere: vi.fn(),
      findAfterCursor: vi.fn(),
      bulkInsert: vi.fn(),
      bulkUpdate: vi.fn(),
      importFromSpreadsheet: vi.fn(),
      exportToSpreadsheet: vi.fn(),
      schema: { table: 'TestModel' },
    };

    db.TestModel = modelMock;
    controller = new BaseController('TestModel');

    req = { body: {}, query: {}, params: {} };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      send: vi.fn(),
      setHeader: vi.fn()
    };
  });

  describe('create', () => {
    it('should create a new record', async () => {
      modelMock.insert.mockResolvedValue({ id: 1 });
      req.body = { name: 'test' };

      await controller.create(req, res);

      expect(modelMock.insert).toHaveBeenCalledWith({ name: 'test' });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ id: 1 });
    });
  });

  describe('getWhere', () => {
    it('should fetch records with filters', async () => {
      modelMock.findWhere.mockResolvedValue([{ id: 1 }]);
      req.query = { is_active: true };

      await controller.getWhere(req, res);

      expect(modelMock.findWhere).toHaveBeenCalledWith([{ is_active: true }]);
      expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
    });
  });

  describe('getById', () => {
    it('should return record by ID', async () => {
      modelMock.findById.mockResolvedValue({ id: 1 });
      req.params.id = 1;

      await controller.getById(req, res);

      expect(modelMock.findById).toHaveBeenCalledWith(1);
      expect(res.json).toHaveBeenCalledWith({ id: 1 });
    });

    it('should return 404 if record not found', async () => {
      modelMock.findById.mockResolvedValue(null);
      req.params.id = 999;

      await controller.getById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'TestModel not found' });
    });
  });

  describe('update', () => {
    it('should update a record', async () => {
      modelMock.updateWhere.mockResolvedValue([{ id: '1' }]);
      req.query = { id: '1' };
      req.body = { name: 'Updated' };
      modelMock.findById.mockResolvedValue({ id: '1' });

      await controller.update(req, res);

      expect(modelMock.updateWhere).toHaveBeenCalledWith([{ id: '1' }], { name: 'Updated' });
      expect(res.json).toHaveBeenCalledWith({ updatedRecords: [{ id: '1' }] });
    });
  });

  describe('remove', () => {
    it('should mark a record as inactive', async () => {
      modelMock.updateWhere.mockResolvedValue(true);
      req.query = { id: 1 };

      await controller.remove(req, res);

      expect(modelMock.updateWhere.mock.calls[0][0]).toEqual({ id: 1 });
      expect(modelMock.updateWhere.mock.calls[0][1].deactivated_at).not.toBeNull();
      expect(new Date(modelMock.updateWhere.mock.calls[0][1].deactivated_at)).toBeInstanceOf(Date);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'TestModel marked as inactive' });
    });
  });

  describe('restore', () => {
    it('should mark a record as active', async () => {
      modelMock.updateWhere.mockResolvedValue(true);
      req.query = { id: 1 };

      await controller.restore(req, res);

      expect(modelMock.updateWhere).toHaveBeenCalledWith(
        [
          { deactivated_at: expect.objectContaining({ $not: null }) },
          { id: 1 }
        ],
        { deactivated_at: null },
        { includeDeactivated: true }
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'TestModel marked as active' });
    });
  });

  describe('get', () => {
    it('should fetch records using cursor-based pagination', async () => {
      modelMock.findAfterCursor.mockResolvedValue([{ id: 1 }]);
      req.query = { limit: 10 };

      await controller.get(req, res);

      expect(modelMock.findAfterCursor).toHaveBeenCalledWith({ limit: 10 });
      expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
    });
  });

  describe('bulkInsert', () => {
    it('should insert multiple records', async () => {
      modelMock.bulkInsert.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      req.body = [{ name: 'one' }, { name: 'two' }];

      await controller.bulkInsert(req, res);

      expect(modelMock.bulkInsert).toHaveBeenCalledWith(req.body);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith([{ id: 1 }, { id: 2 }]);
    });
  });

  describe('bulkUpdate', () => {
    it('should update multiple records', async () => {
      modelMock.bulkUpdate.mockResolvedValue({ updated: 2 });
      req.body = {
        filters: [{ is_active: true }],
        updates: { name: 'updated' }
      };

      await controller.bulkUpdate(req, res);

      expect(modelMock.bulkUpdate).toHaveBeenCalledWith(req.body.filters, req.body.updates);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ updated: 2 });
    });
  });

  describe('importXls', () => {
    it('should import records from spreadsheet', async () => {
      modelMock.importFromSpreadsheet.mockResolvedValue([{ id: 1 }]);
      req.body = { rows: [{ name: 'test' }] };

      await controller.importXls(req, res);

      expect(modelMock.importFromSpreadsheet).toHaveBeenCalledWith(req.body);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
    });
  });

  describe('exportXls', () => {
    it('should export data to spreadsheet', async () => {
      const buffer = Buffer.from('xlsx content');
      modelMock.exportToSpreadsheet.mockResolvedValue(buffer);
      req.body = { filters: [] };

      await controller.exportXls(req, res);

      expect(modelMock.exportToSpreadsheet).toHaveBeenCalledWith(req.body);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="TestModel.xlsx"');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(res.send).toHaveBeenCalledWith(buffer);
    });
  });
});
