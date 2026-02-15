/**
 * @file RoleMembers model — extends TableModel for RBAC role memberships
 * @module core/models/RoleMembers
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import roleMembersSchema from '../schemas/roleMembersSchema.js';

export default class RoleMembers extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, roleMembersSchema, logger);
  }
}
