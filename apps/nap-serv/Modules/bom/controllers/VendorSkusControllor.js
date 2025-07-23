'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

import BaseController from '../../../src/utils/BaseController.js';

class VendorSkusController extends BaseController {
  constructor(db, pgp, logger = null) {
    super(db, pgp, 'vendorSkus', logger);
  }
}
export default VendorSkusController;