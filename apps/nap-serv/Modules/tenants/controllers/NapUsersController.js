'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import bcrypt from 'bcrypt';
import BaseController from '../../../src/utils/BaseController.js';
import db from '../../../src/db/db.js'; 

class NapUsersController extends BaseController {
  constructor() {
    super('napUsers');
  }

  register = async (req, res) => {
    console.log('Registering user:', req.body);

    const { tenant_code, schema_name, email, password, user_name, role } =
      req.body;

    try {
      const password_hash = await bcrypt.hash(password, 10);

      await db('napUsers', 'admin').insert({
        tenant_code,
        schema_name: schema_name || tenant_code?.toLowerCase(), // Assume schema_name is the same as tenant_code if not provided
        email,
        password_hash,
        user_name,
        role,
      });

      res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
      console.error('Registration error:', err);
      res.status(500).json({ message: 'Error registering user' });
    }
  };
}

const instance = new NapUsersController();

export default instance; // Use in production and development environments
export { NapUsersController }; // Use in test environment
