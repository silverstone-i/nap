import { VendorPartsController } from '../../../modules/activities/controllers/VendorPartsController.js';
import vendorPartsSchema from '../../../modules/activities/schemas/vendorPartsSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(vendorPartsSchema, VendorPartsController);
