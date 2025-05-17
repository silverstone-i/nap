// UnitsController.test.js

import { jest } from '@jest/globals';
import { SubProjectsController } from '../../../modules/activities/controllers/SubProjectsController.js';
import subProjectsSchema from '../../../modules/activities/schemas/subProjectsSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(subProjectsSchema, SubProjectsController);