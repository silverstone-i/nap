import { jest } from '@jest/globals';
import { ArInvoiceLinesController } from '../../../modules/ar/controllers/ArInvoiceLinesController.js';
import arInvoiceLinesSchema from '../../../modules/ar/schemas/arInvoiceLinesSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(arInvoiceLinesSchema, ArInvoiceLinesController);
