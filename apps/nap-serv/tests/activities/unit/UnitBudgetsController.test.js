import { jest } from '@jest/globals';
import { UnitBudgetsController } from '../../../modules/activities/controllers/UnitBudgetsController.js';
import unitBudgetsSchemaModule from '../../../modules/activities/schemas/UnitBudgetsSchema.js';
const unitBudgetsSchema = unitBudgetsSchemaModule.default || unitBudgetsSchemaModule;
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(unitBudgetsSchema, UnitBudgetsController);
