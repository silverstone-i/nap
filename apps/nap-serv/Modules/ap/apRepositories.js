'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

import ApCreditMemos from './models/ApCreditMemos.js';
import ApInvoiceLines from './models/ApInvoiceLines.js';
import ApInvoices from './models/ApInvoices.js';
import Payments from './models/Payments.js';

const repositories = {
  apCreditMemos: ApCreditMemos,
  apInvoiceLines: ApInvoiceLines,
  apInvoices: ApInvoices,
  payments: Payments,
};

export default repositories;