/**
 * @file Countries controller — read-only access to admin.countries
 * @module tenants/controllers/countriesController
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import ViewController from '../../../lib/ViewController.js';

class CountriesController extends ViewController {
  constructor() {
    super('countries', 'country');
  }

  /**
   * Override getSchema — countries always live in the admin schema.
   */
  getSchema(_req) {
    return 'admin';
  }
}

const instance = new CountriesController();
export default instance;
export { CountriesController };
