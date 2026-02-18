/**
 * @file CompanyMembers model — extends TableModel for RBAC Layer 2 company scoping
 * @module core/models/CompanyMembers
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import companyMembersSchema from '../schemas/companyMembersSchema.js';

export default class CompanyMembers extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, companyMembersSchema, logger);
  }
}
