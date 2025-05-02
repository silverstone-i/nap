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
import projectActualProfitabilityViewSchema from '../schemas/projectActualProfitabilityViewSchema.js';

class ProjectActualProfitabilityView extends ReadOnlyModel {
  static isViewModel = true;

  constructor(db, pgp) {
    super(db, pgp, projectActualProfitabilityViewSchema);
  }
}

export default ProjectActualProfitabilityView;
