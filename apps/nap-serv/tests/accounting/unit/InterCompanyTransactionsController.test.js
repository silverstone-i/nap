import { InterCompanyTransactionsController } from '../../../modules/accounting/controllers/InterCompanyTransactionsController.js';
import interCompanyTransactionsSchema from '../../../modules/accounting/schemas/interCompanyTransactionsSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(interCompanyTransactionsSchema, InterCompanyTransactionsController);
