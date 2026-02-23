/**
 * @file MatchReviewLogs controller — read-only access to admin.match_review_logs
 * @module tenants/controllers/matchReviewLogsController
 *
 * Exposes match review audit trail for BOM vendor SKU matching decisions.
 * Read-only — match decisions are written by the BOM matching service.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import ViewController from '../../../lib/ViewController.js';

class MatchReviewLogsController extends ViewController {
  constructor() {
    super('matchReviewLogs', 'match-review-log');
  }

  /**
   * Override getSchema to always use admin schema for match_review_logs.
   */
  getSchema(_req) {
    return 'admin';
  }
}

const instance = new MatchReviewLogsController();
export default instance;
export { MatchReviewLogsController };
