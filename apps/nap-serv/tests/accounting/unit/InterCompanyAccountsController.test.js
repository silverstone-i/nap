import { InterCompanyAccountsController } from '../../../modules/accounting/controllers/InterCompanyAccountsController.js';
import interCompanyAccountsSchema from '../../../modules/accounting/schemas/interCompanyAccountsSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(interCompanyAccountsSchema, InterCompanyAccountsController);
