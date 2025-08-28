'use strict';

import { TableModel } from 'pg-schemata';
import roleMembersSchema from '../schemas/roleMembersSchema.js';

class RoleMembers extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, roleMembersSchema, logger);
  }
}

export default RoleMembers;
