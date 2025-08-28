'use strict';

import { TableModel } from 'pg-schemata';
import policiesSchema from '../schemas/policiesSchema.js';

class Policies extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, policiesSchema, logger);
  }
}

export default Policies;
