import { jest } from '@jest/globals';
import { UnitsController } from '../../../modules/activities/controllers/UnitsController.js';
import unitsSchema from '../../../modules/activities/schemas/unitsSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(unitsSchema, UnitsController);