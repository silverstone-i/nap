'use strict';

/*
 * Copyright © 2025-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */
import createRouter from '../../../../src/utils/createRouter.js';
import EmbeddingMatchesController from '../../controllers/EmbeddingMatchesController.js';

export default createRouter(EmbeddingMatchesController, router => {
  router.route('/execute').post((req, res) => EmbeddingMatchesController.executeMatches(req, res));
});
