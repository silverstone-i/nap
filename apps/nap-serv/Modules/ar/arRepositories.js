'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import ArInvoiceLines from './models/ArInvoiceLines.js';
import ArInvoices from './models/ArInvoices.js';
import Clients from './models/Clients.js';
import Receipts from './models/Receipts.js';

const repositories = {
  arInvoiceLines: ArInvoiceLines,
  arInvoices: ArInvoices,
  clients: Clients,
  receipts: Receipts,
};

export default repositories;
