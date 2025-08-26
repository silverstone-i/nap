import { getAllSchemas } from '../../../modules/tenants/controllers/admin.controller.js';
import * as dbModule from '../../../src/db/db.js';

vi.mock('../../../src/db/db.js', () => ({
  default: vi.fn()
}));

describe('admin.controller', () => {
  describe('getAllSchemas', () => {
    let req, res;

    beforeEach(() => {
      req = {};

      res = {
        json: vi.fn(),
        status: vi.fn().mockReturnThis()
      };
    });

    it('should return all schemas excluding system schemas', async () => {
      const findAllMock = vi.fn().mockResolvedValue([
        { tenant_code: 'admin' },
        { tenant_code: 'ciq' },
        { tenant_code: 'napsoft' },
        { tenant_code: 'pg_catalog' }
      ]);

      dbModule.default.mockImplementation(() => ({ findAll: findAllMock }));

      await getAllSchemas(req, res);

      expect(res.json).toHaveBeenCalledWith(['admin', 'ciq', 'napsoft', 'pg_catalog']);
    });

    it('should handle errors', async () => {
      dbModule.default.mockImplementation(() => {
        throw new Error('db failure');
      });

      await getAllSchemas(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: 'db failure' });
    });
  });
});