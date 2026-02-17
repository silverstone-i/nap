/**
 * @file Repository map for the AP module (tenant-scope)
 * @module ap/apRepositories
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import ApInvoices from './models/ApInvoices.js';
import ApInvoiceLines from './models/ApInvoiceLines.js';
import Payments from './models/Payments.js';
import ApCreditMemos from './models/ApCreditMemos.js';

const repositories = {
  apInvoices: ApInvoices,
  apInvoiceLines: ApInvoiceLines,
  payments: Payments,
  apCreditMemos: ApCreditMemos,
};

export default repositories;
