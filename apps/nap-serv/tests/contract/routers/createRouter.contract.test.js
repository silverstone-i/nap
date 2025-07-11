import express from 'express';
import request from 'supertest';
import createRouter from '../../../src/utils/createRouter.js';
import BaseController from '../../../src/utils/BaseController.js';

/** Stub controller that overrides all methods for contract testing */
class StubController extends BaseController {
  constructor() {
    super('StubModel');
    this.model = {}; // model is unused in stubs
  }

  create = (req, res) => res.status(201).json({ method: 'create' });
  getWhere = (req, res) => res.json({ method: 'getWhere' });
  getById = (req, res) => res.json({ method: 'getById' });
  get = (req, res) => res.json({ method: 'get' });
  update = (req, res) => res.status(200).json({ method: 'update' });
  archive = (req, res) => res.status(200).json({ method: 'archive' });
  restore = (req, res) => res.status(200).json({ method: 'restore' });
  bulkInsert = (req, res) => res.status(200).json({ method: 'bulkInsert' });
  bulkUpdate = (req, res) => res.status(200).json({ method: 'bulkUpdate' });
  importXls = (req, res) => res.status(200).json({ method: 'importXls' });
  exportXls = (req, res) => res.json({ method: 'exportXls' });
}

describe('createRouter contract test', () => {
  const app = express();
  app.use((req, res, next) => {
    req.user = { user_name: 'contract_test_user' }; // mock user context
    next();
  });
  app.use(express.json());
  app.use('/api/test', createRouter(new StubController()));

  it.each([
    ['POST', '/api/test', 201, 'create'],
    ['GET', '/api/test/where', 200, 'getWhere'],
    ['GET', '/api/test/:id', 200, 'getById'],
    ['GET', '/api/test', 200, 'get'],
    ['PUT', '/api/test/update', 200, 'update'],
    ['DELETE', '/api/test/archive', 200, 'archive'],
    ['PATCH', '/api/test/restore', 200, 'restore'],
    ['POST', '/api/test/bulk-insert', 200, 'bulkInsert'],
    ['PUT', '/api/test/bulk-update', 200, 'bulkUpdate'],
    ['POST', '/api/test/import-xls', 200, 'importXls'],
    ['POST', '/api/test/export-xls', 200, 'exportXls'],
  ])('%s %s → %s (%s)', async (method, path, expectedStatus, expectedMethod) => {
    const testPath = path.includes(':id') ? path.replace(':id', '123') : path;
    const reqBuilder = request(app)[method.toLowerCase()](testPath);
    const payload =
      method === 'PUT' && path.includes(':id')
        ? { id: '123', updated_by: 'contract_test_user' }
        : {};
    const res = ['POST', 'PUT'].includes(method) ? await reqBuilder.send(payload) : await reqBuilder;
    expect(res.status).toBe(expectedStatus);
    expect(res.body).toEqual({ method: expectedMethod });
  });
});
