import { InternalTransfersController } from '../../../modules/accounting/controllers/InternalTransfersController.js';
import internalTransfersSchema from '../../../modules/accounting/schemas/internalTransfersSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(internalTransfersSchema, InternalTransfersController);
