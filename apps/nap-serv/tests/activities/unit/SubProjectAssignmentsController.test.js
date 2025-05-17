// UnitAssignmentsController.test.js

import { jest } from '@jest/globals';
import { SubProjectAssignmentsController } from '../../../modules/activities/controllers/SubProjectAssignmentsController.js';
import subProjectAssignmentsSchema from '../../../modules/activities/schemas/subProjectAssignmentsSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(subProjectAssignmentsSchema, SubProjectAssignmentsController);
