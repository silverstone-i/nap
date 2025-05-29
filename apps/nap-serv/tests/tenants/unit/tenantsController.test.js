import { vi } from 'vitest';
import { TenantsController } from '../../../modules/tenants/controllers/TenantsController.js';
import tenantsSchema from '../../../modules/tenants/schemas/tenantsSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(tenantsSchema, TenantsController, {
  mockOverrides: {
    getAllowedModulesById: vi.fn(),
  },
  extraTests: ({ mockRes, controller, model }) => {
    describe('getAllAllowedModules', () => {
      it('should return allowed modules', async () => {
        const req = { params: { id: 'abc' } };
        const res = mockRes();
        const allowedModules = ['accounting', 'projects'];
        model.getAllowedModulesById.mockResolvedValue(allowedModules);

        await controller.getAllAllowedModules(req, res);

        expect(model.getAllowedModulesById).toHaveBeenCalledWith('abc');
        expect(res.json).toHaveBeenCalledWith({
          allowed_modules: allowedModules,
        });
      });

      it('should return 404 if tenant not found', async () => {
        const req = { params: { id: 'abc' } };
        const res = mockRes();
        model.getAllowedModulesById.mockResolvedValue(null);

        await controller.getAllAllowedModules(req, res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'Tenant not found' });
      });

      it('should handle error on getAllAllowedModules', async () => {
        const req = { params: { id: 'abc' } };
        const res = mockRes();
        model.getAllowedModulesById.mockRejectedValue(new Error('Find error'));

        await controller.getAllAllowedModules(req, res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Find error' });
      });
    });
  },
});
