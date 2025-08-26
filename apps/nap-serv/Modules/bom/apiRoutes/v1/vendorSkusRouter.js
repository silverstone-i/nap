'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import vendorSkusController from '../../controllers/VendorSkusController.js';
import createRouter from '../../../../src/utils/createRouter.js';

export default createRouter(
  vendorSkusController,
  router => {
    // Custom route placed before ':id' to avoid being captured by the dynamic route
    router.get('/unmatched', (req, res) => vendorSkusController.getUnmatchedVendorSkus(req, res));

    // Re-add ':id' route after custom routes since we disabled it in options
    router.get('/:id', (req, res) => vendorSkusController.getById(req, res));
  },
  { disableGetById: true }
);
