import { NapUsersController } from '../../../modules/tenants/controllers/NapUsersController.js';
import napUsersSchema from '../../../modules/tenants/schemas/napUsersSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(napUsersSchema, NapUsersController);
