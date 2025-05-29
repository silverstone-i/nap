import { ArInvoicesController } from '../../../modules/ar/controllers/ArInvoicesController.js';
import arInvoicesSchema from '../../../modules/ar/schemas/arInvoicesSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(arInvoicesSchema, ArInvoicesController);
