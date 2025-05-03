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
import unitAssignmentsSchema from "../schemas/unitAssignmentsSchema.js";

class UnitAssignments extends BaseModel {
  constructor(db, pgp, logger) {
    super(db, pgp, unitAssignmentsSchema, logger);
  }
}

export default UnitAssignments;