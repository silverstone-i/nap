import { jest } from '@jest/globals';
import { UnitAssignmentsController } from '../../../modules/activities/controllers/UnitAssignmentsController.js';
import unitAssignmentsSchema from '../../../modules/activities/schemas/unitAssignmentsSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(unitAssignmentsSchema, UnitAssignmentsController);
