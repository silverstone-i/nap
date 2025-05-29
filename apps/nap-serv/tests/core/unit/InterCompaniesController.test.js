import { InterCompaniesController } from '../../../modules/core/controllers/InterCompaniesController.js';
import interCompaniesSchema from '../../../modules/core/schemas/interCompaniesSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(interCompaniesSchema, InterCompaniesController);
