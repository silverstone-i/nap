/**
 * @file Repository map for the AR module (tenant-scope)
 * @module ar/arRepositories
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import ArClients from './models/ArClients.js';
import ArInvoices from './models/ArInvoices.js';
import ArInvoiceLines from './models/ArInvoiceLines.js';
import Receipts from './models/Receipts.js';

const repositories = {
  arClients: ArClients,
  arInvoices: ArInvoices,
  arInvoiceLines: ArInvoiceLines,
  receipts: Receipts,
};

export default repositories;
