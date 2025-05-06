'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

import BaseModel from "pg-schemata";
import postingQueuesSchema from "../schemas/postingQueuesSchema";

class PostingQueues extends BaseModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, postingQueuesSchema, logger);
  }
}

export default PostingQueues;