'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { ReadOnlyModel } from 'pg-schemata';
import activityProfitabilityViewSchema from '../schemas/activityProfitabilityViewSchema.js';

class ActivityProfitabiltyView extends ReadOnlyModel {
  static isViewModel = true;
  
  constructor(db, pgp, logger) {
    super(db, pgp, activityProfitabilityViewSchema, logger);
  }
}

export default ActivityProfitabiltyView;

