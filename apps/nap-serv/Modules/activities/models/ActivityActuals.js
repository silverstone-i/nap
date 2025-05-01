'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

import { BaseModel } from 'pg-schemata';
import activityActualsSchema from '../schemas/activityActualsSchema.js';

class ActivityActuals extends BaseModel {
  constructor(db, pgp) {
    super(db, pgp, activityActualsSchema);
  }
}

export default ActivityActuals;