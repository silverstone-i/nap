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
import deliverablesSchema from '../schemas/deliverablesSchema.js';

class Units extends TableModel {
  constructor(db, pgp, logger) {
    super(db, pgp, deliverablesSchema, logger);
  }
}

export default Units;
