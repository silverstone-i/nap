'use strict';

/*
 * Copyright © 2025-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { TableModel } from 'pg-schemata';
import embeddingMatchesSchema from '../schemas/embeddingMatchesSchema.js';

class EmbeddingMatches extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, embeddingMatchesSchema, logger);
  }
}

export default EmbeddingMatches;
