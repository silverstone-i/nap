import { ChartOfAccountsController } from '../../../modules/accounting/controllers/ChartOfAccountsController.js';
import chartOfAccountsSchema from '../../../modules/accounting/schemas/chartOfAccountsSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(chartOfAccountsSchema, ChartOfAccountsController);
