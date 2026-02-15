/**
 * @file MatchReviewLogs model — extends TableModel for admin.match_review_logs
 * @module tenants/models/MatchReviewLogs
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import matchReviewLogsSchema from '../schemas/matchReviewLogsSchema.js';

export default class MatchReviewLogs extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, matchReviewLogsSchema, logger);
  }
}
