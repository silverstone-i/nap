import { jest } from '@jest/globals';
import { DeliverablesController } from '../../../modules/activities/controllers/DeliverablesController.js';
import deliverablesSchema from '../../../modules/activities/schemas/deliverablesSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(deliverablesSchema, DeliverablesController);