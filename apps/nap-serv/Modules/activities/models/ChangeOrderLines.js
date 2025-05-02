'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

import { BaseModel } from "pg-schemata";
import changeOrderLinesSchema from "../schemas/changeOrderLinesSchema.js";

class ChangeOrderLines extends BaseModel {
  constructor(db, pgp, logger) {
    super(db, pgp, changeOrderLinesSchema, logger);
  }
}

export default ChangeOrderLines;