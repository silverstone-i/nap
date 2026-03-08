/**
 * @file Repository map for the AR module (tenant-scope)
 * @module ar/arRepositories
 *
 * No arClients — PRD removed ar_clients table.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import ArInvoices from './models/ArInvoices.js';
import ArInvoiceLines from './models/ArInvoiceLines.js';
import Receipts from './models/Receipts.js';

const repositories = {
  arInvoices: ArInvoices,
  arInvoiceLines: ArInvoiceLines,
  receipts: Receipts,
};

export default repositories;
