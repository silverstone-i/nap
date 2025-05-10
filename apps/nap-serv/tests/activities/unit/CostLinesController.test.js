import { jest } from '@jest/globals';
import { CostLinesController } from '../../../modules/activities/controllers/CostLinesController.js';
import costLinesSchema from '../../../modules/activities/schemas/costLinesSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(costLinesSchema, CostLinesController);