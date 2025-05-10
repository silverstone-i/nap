import { jest } from '@jest/globals';
import { PaymentsController } from '../../../modules/ap/controllers/PaymentsController.js';
import paymentsSchema from '../../../modules/ap/schemas/paymentsSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(paymentsSchema, PaymentsController);