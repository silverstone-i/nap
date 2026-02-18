/**
 * @file ProjectMembers model — extends TableModel for RBAC Layer 2 project assignments
 * @module core/models/ProjectMembers
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import projectMembersSchema from '../schemas/projectMembersSchema.js';

export default class ProjectMembers extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, projectMembersSchema, logger);
  }
}
