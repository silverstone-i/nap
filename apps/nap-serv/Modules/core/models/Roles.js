'use strict';

import { TableModel } from 'pg-schemata';
import rolesSchema from '../schemas/rolesSchema.js';

class Roles extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, rolesSchema, logger);
  }
}

export default Roles;
