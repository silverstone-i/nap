// UnitAssignmentsController.test.js

import { jest } from '@jest/globals';
import { DeliverableAssignmentsController } from '../../../modules/activities/controllers/DeliverableAssignmentsController.js';
import deliverableAssignmentsSchema from '../../../modules/activities/schemas/deliverableAssignmentsSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(deliverableAssignmentsSchema, DeliverableAssignmentsController);
