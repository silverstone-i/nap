'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

import TableModel from 'pg-schemata';
import catalogItemsSchema from '../schemas/catalogItemsSchema.js';

class CatalogItems extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, catalogItemsSchema, logger);
  }
}

export default CatalogItems;
