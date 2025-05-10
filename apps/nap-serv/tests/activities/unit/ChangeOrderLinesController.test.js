import { ChangeOrderLinesController } from '../../../modules/activities/controllers/ChangeOrderLinesController.js';
import changeOrderLinesSchema from '../../../modules/activities/schemas/changeOrderLinesSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(changeOrderLinesSchema, ChangeOrderLinesController);
