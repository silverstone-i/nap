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

class InterCompaniesController extends BaseController {
  constructor(model = db.interCompanies) {
    super('interCompanies', 'Inter companies');
    this.model = model;
  }
}

const instance = new InterCompaniesController();

export default instance; // Use in production and development environments
export { InterCompaniesController }; // Use in test environment

