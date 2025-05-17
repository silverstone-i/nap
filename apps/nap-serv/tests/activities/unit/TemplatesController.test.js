// UnitBudgetsController.test.js

import { jest } from '@jest/globals';
import { TemplatesController } from '../../../modules/activities/controllers/TemplatesController.js';
import templatesSchema from '../../../modules/activities/schemas/templatesSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(templatesSchema, TemplatesController);