'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { QueryModel } from 'pg-schemata';
import exportAddressesSchema from '../schemas/exportAddressesSchema.js';

class ExportAddresses extends QueryModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, exportAddressesSchema, logger);
  }
}

export default ExportAddresses;
