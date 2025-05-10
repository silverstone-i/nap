import { jest } from '@jest/globals';
import { ActivitiesController } from '../../../modules/activities/controllers/ActivitiesController.js';
import activitiesSchema from '../../../modules/activities/schemas/activitiesSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(activitiesSchema, ActivitiesController);