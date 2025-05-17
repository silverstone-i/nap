'use strict';

// units.js

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { TableModel } from 'pg-schemata';
import subProjectsSchema from '../schemas/subProjectsSchema.js';

class Units extends TableModel {
  constructor(db, pgp, logger) {
    super(db, pgp, subProjectsSchema, logger);
  }
}

export default Units;
