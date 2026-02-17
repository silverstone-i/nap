/**
 * @file DeliverableAssignments model — extends TableModel for deliverable assignment entities
 * @module activities/models/DeliverableAssignments
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { TableModel } from 'pg-schemata';
import deliverableAssignmentsSchema from '../schemas/deliverableAssignmentsSchema.js';

export default class DeliverableAssignments extends TableModel {
  constructor(db, pgp, logger = null) {
    super(db, pgp, deliverableAssignmentsSchema, logger);
  }
}
