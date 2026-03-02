/**
 * @file Accounting services barrel — stable cross-boundary API
 * @module accounting/services
 *
 * Re-exports the public API for consumers outside the accounting module.
 * Intra-module consumers may import directly from individual files.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

export { postAPInvoice, postAPPayment, postARInvoice, postARReceipt, postActualCost } from './postingService.js';
