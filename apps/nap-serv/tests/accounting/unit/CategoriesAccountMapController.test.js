import { CategoriesAccountMapController } from '../../../modules/accounting/controllers/CategoriesAccountMapController.js';
import categoriesAccountMapSchema from '../../../modules/accounting/schemas/categoriesAccountMapSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(categoriesAccountMapSchema, CategoriesAccountMapController);