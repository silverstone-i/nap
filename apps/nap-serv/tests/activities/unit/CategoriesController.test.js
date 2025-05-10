import { jest } from '@jest/globals';
import { CategoriesController } from '../../../modules/activities/controllers/CategoriesController.js';
import categoriesSchema from '../../../modules/activities/schemas/categoriesSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(categoriesSchema, CategoriesController);