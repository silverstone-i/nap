import { jest } from '@jest/globals';
import { ApInvoicesController } from '../../../modules/ap/controllers/ApInvoicesController.js';
import apInvoicesSchema from '../../../modules/ap/schemas/apInvoicesSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(apInvoicesSchema, ApInvoicesController);