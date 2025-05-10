import { LedgerBalancesController } from '../../../modules/accounting/controllers/LedgerBalancesController.js';
import ledgerBalancesSchema from '../../../modules/accounting/schemas/ledgerBalancesSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(ledgerBalancesSchema, LedgerBalancesController);