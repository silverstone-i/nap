import { jest } from '@jest/globals';
import { ApInvoiceLinesController } from '../../../modules/ap/controllers/ApInvoiceLinesController.js';
import apInvoiceLinesSchema from '../../../modules/ap/schemas/apInvoiceLinesSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(apInvoiceLinesSchema, ApInvoiceLinesController);