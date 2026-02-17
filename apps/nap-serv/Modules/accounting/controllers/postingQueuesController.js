/**
 * @file Posting Queues controller — list and retry failed entries
 * @module accounting/controllers/postingQueuesController
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import BaseController from '../../../src/lib/BaseController.js';
import { postEntry } from '../services/postingService.js';
import logger from '../../../src/utils/logger.js';

class PostingQueuesController extends BaseController {
  constructor() {
    super('postingQueues', 'posting-queue');
  }

  async retry(req, res) {
    try {
      const schema = this.getSchema(req);
      const queueId = req.body.queue_id || req.query.id;
      if (!queueId) {
        return res.status(400).json({ error: 'queue_id is required' });
      }

      const queue = await this.model(schema).findById(queueId);
      if (!queue) return res.status(404).json({ error: 'Posting queue entry not found' });
      if (queue.status !== 'failed') {
        return res.status(400).json({ error: `Can only retry failed entries, current status: ${queue.status}` });
      }

      const result = await postEntry(schema, queue.journal_entry_id);
      logger.info(`Posting queue ${queueId} retried successfully`);
      return res.json(result);
    } catch (err) {
      return this.handleError(err, res, 'retrying', this.errorLabel);
    }
  }
}

const instance = new PostingQueuesController();
export default instance;
export { PostingQueuesController };
