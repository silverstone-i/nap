import { AccountClassificationsController } from '../../../modules/accounting/controllers/AccountClassificationsController.js';
import accountClassificationsSchema from '../../../modules/accounting/schemas/accountClassificationsSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(accountClassificationsSchema, AccountClassificationsController);