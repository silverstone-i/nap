import { BudgetsController } from '../../../modules/activities/controllers/BudgetsController.js';
import budgetsSchema from '../../../modules/activities/schemas/budgetsSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(budgetsSchema, BudgetsController);
