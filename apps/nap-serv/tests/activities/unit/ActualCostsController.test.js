import { ActualCostsController } from '../../../modules/activities/controllers/ActualCostsController.js';
import actualCostsSchema from '../../../modules/activities/schemas/actualCostsSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(actualCostsSchema, ActualCostsController);
