/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { AssignmentProjects } from './models/AssignmentProjects.js';
import { Projects } from './models/Projects.js';
/** Does: Registers Projects repositories. Used by: cell composition. */
export const repositories = {
  assignment_projects: AssignmentProjects,
  projects: Projects,
};
