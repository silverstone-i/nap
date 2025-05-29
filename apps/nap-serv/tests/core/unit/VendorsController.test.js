import { VendorsController } from '../../../modules/core/controllers/VendorsController.js';
import vendorsSchema from '../../../modules/core/schemas/vendorsSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(vendorsSchema, VendorsController);
