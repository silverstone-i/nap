'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import VendorSkus from './models/VendorSkus.js';
import CatalogSkus from './models/CatalogSkus.js';
import VendorPricing from './models/VendorPricing.js';

const repositories = {
  vendorSkus: VendorSkus,
  catalogSkus: CatalogSkus,
  vendorPricing: VendorPricing,
};

export default repositories;
