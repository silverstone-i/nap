import { ProjectsController } from '../../../modules/activities/controllers/ProjectsController.js';
import projectsSchema from '../../../modules/activities/schemas/projectsSchema.js';
import { generateCrudTestsForSchema } from '../../util/generateCrudTestsForSchema.js';

generateCrudTestsForSchema(projectsSchema, ProjectsController);
