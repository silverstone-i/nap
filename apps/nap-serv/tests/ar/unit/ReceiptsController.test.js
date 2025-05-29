import { ReceiptsController } from '../../../modules/ar/controllers/ReceiptsController.js';
import receiptsSchema from '../../../modules/ar/schemas/receiptsSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(receiptsSchema, ReceiptsController);