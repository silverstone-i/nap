import { jest } from '@jest/globals';
import TenantsController from '../../../modules/tenants/controllers/TenantsController.js';
import { db } from '../../../src/db/db.js';
import { runControllerCrudUnitTests } from '../../util/runControllerCrudUnitTests.js';

jest.mock('../../../src/db/db.js');

const getAllowedModulesById = jest.fn();

runControllerCrudUnitTests({
  name: 'Tenants',
  controller: TenantsController,
  modelName: 'tenants',
  db,
  extraModelMethods: {
    getAllowedModulesById,
  },
  extraTests: ({ mockRes, controller, model }) => {
    describe('getAllAllowedModules', () => {
      it('should return allowed modules', async () => {
        const req = { params: { id: 'abc' } };
        const res = mockRes();
        const allowedModules = ['accounting', 'projects'];
        getAllowedModulesById.mockResolvedValue(allowedModules);

        await controller.getAllAllowedModules(req, res);

        expect(getAllowedModulesById).toHaveBeenCalledWith('abc');
        expect(res.json).toHaveBeenCalledWith({ allowed_modules: allowedModules });
      });

      it('should return 404 if tenant not found', async () => {
        const req = { params: { id: 'abc' } };
        const res = mockRes();
        getAllowedModulesById.mockResolvedValue(null);

        await controller.getAllAllowedModules(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Tenant not found' });
      });

      it('should handle error on getAllAllowedModules', async () => {
        const req = { params: { id: 'abc' } };
        const res = mockRes();
        getAllowedModulesById.mockRejectedValue(new Error('Find error'));

        await controller.getAllAllowedModules(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Find error' });
      });
    });
  },
});