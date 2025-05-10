'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import BaseController from '../../../src/utils/BaseController.js';

class JournalEntriesController extends BaseController {
  constructor(model = db.journalEntries) {
    super('journalEntries', 'Journal entry');
    this.model = model;
  }
}

const instance = new JournalEntriesController();

export default instance; // Use in production and development environments
export { JournalEntriesController }; // Use in test environment