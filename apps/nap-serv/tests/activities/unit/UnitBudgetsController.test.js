import { UnitBudgetsController } from '../../../modules/activities/controllers/UnitBudgetsController.js';
import unitBudgetsSchema from '../../../modules/activities/schemas/unitBudgetsSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(unitBudgetsSchema, UnitBudgetsController);
