'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

import { jest } from '@jest/globals';

export function runControllerCrudUnitTests({ name, controller, modelName, db, extraTests }) {
  describe(`${name} Controller`, () => {
    const mockRes = () => {
      const res = {};
      res.status = jest.fn().mockReturnValue(res);
      res.json = jest.fn().mockReturnValue(res);
      res.send = jest.fn();
      res.end = jest.fn();
      return res;
    };

    beforeAll(() => {
      jest.spyOn(console, 'log').mockImplementation(() => {});
      jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterAll(() => {
      console.log.mockRestore();
      console.error.mockRestore();
    });

    beforeEach(() => {
      db[modelName] = {
        insert: jest.fn(),
        findAll: jest.fn(),
        findById: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      };
    });

    afterEach(() => jest.clearAllMocks());

    const model = () => db[modelName];

    describe('create', () => {
      it('should insert and return 201', async () => {
        const req = { body: { name: 'Item' } };
        const res = mockRes();
        model().insert.mockResolvedValue(req.body);

        await controller.create(req, res);

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(req.body);
      });

      it('should handle insert error', async () => {
        const req = { body: {} };
        const res = mockRes();
        model().insert.mockRejectedValue(new Error('Insert failed'));

        await controller.create(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Insert failed' });
      });
    });

    describe('getAll', () => {
      it('should return all', async () => {
        const req = {};
        const res = mockRes();
        model().findAll.mockResolvedValue([{ id: 1 }]);

        await controller.getAll(req, res);
        expect(res.json).toHaveBeenCalledWith([{ id: 1 }]);
      });

      it('should handle error', async () => {
        const req = {};
        const res = mockRes();
        model().findAll.mockRejectedValue(new Error('Find failed'));

        await controller.getAll(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Find failed' });
      });
    });

    describe('getById', () => {
      const displayName = name
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/^([A-Z][a-z]*) (.*)/, (_, first, rest) => `${first} ${rest.toLowerCase()}`);

      it('should return item by ID', async () => {
        const req = { params: { id: 'abc' } };
        const res = mockRes();
        model().findById.mockResolvedValue({ id: 'abc' });

        await controller.getById(req, res);
        expect(res.json).toHaveBeenCalledWith({ id: 'abc' });
      });

      it('should return 404 if not found', async () => {
        const req = { params: { id: 'abc' } };
        const res = mockRes();
        model().findById.mockResolvedValue(null);

        await controller.getById(req, res);
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: `${displayName} not found` });
      });

      it('should handle error', async () => {
        const req = { params: { id: 'abc' } };
        const res = mockRes();
        model().findById.mockRejectedValue(new Error('Find error'));

        await controller.getById(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Find error' });
      });
    });

    describe('update', () => {
      it('should update and return item', async () => {
        const req = { params: { id: 'abc' }, body: { name: 'Updated' } };
        const res = mockRes();
        model().update.mockResolvedValue({ id: 'abc', name: 'Updated' });

        await controller.update(req, res);
        expect(res.json).toHaveBeenCalledWith({ id: 'abc', name: 'Updated' });
      });

      it('should handle error', async () => {
        const req = { params: { id: 'abc' }, body: {} };
        const res = mockRes();
        model().update.mockRejectedValue(new Error('Update error'));

        await controller.update(req, res);
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Update error' });
      });
    });

    describe('remove', () => {
      it('should delete and return 204', async () => {
        const req = { params: { id: 'abc' } };
        const res = mockRes();
        model().findById.mockResolvedValue({ id: 'abc' });
        model().delete.mockResolvedValue(1);

        await controller.remove(req, res);

        expect(res.status).toHaveBeenCalledWith(204);
        expect(res.send.mock.calls.length + res.end.mock.calls.length).toBeGreaterThan(0);
      });

      it('should handle error', async () => {
        const req = { params: { id: 'abc' } };
        const res = mockRes();
        model().findById.mockResolvedValue({ id: 'abc' });
        model().delete.mockRejectedValue(new Error('Delete error'));

        await controller.remove(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Delete error' });
      });
    });

    if (typeof extraTests === 'function') {
      describe('Extra tests', () => {
        extraTests({ mockRes, controller, model });
      });
    }
  });
}
