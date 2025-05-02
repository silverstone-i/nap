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
import projectActivitiesSchema from "../schemas/projectActivitiesSchema.js";

class ProjectActivities extends BaseModel {
  constructor(db, pgp) {
    super(db, pgp, projectActivitiesSchema);
  }
}

export default ProjectActivities;