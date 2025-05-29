import { ApCreditMemosController } from '../../../modules/ap/controllers/ApCreditMemosController.js';
import apCreditMemosSchema from '../../../modules/ap/schemas/apCreditMemosSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(apCreditMemosSchema, ApCreditMemosController);
