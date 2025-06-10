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
    const { tenant_code, schema_name, email, password, user_name, role } = req.body;

    if (!tenant_code || !email || !password || !user_name || !role) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    if (!['super-admin', 'admin', 'user'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(user_name)) {
      return res.status(400).json({ message: 'Invalid username format' });
    }
    if (user_name.length < 3 || user_name.length > 20) {
      return res.status(400).json({ message: 'Username must be between 3 and 20 characters long' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(tenant_code)) {
      return res.status(400).json({ message: 'Invalid tenant code format' });
    }

    try {
      const tenant = await db('tenants', 'admin').findOneBy([
        {
          tenant_code,
          is_active: true,
        },
      ]);

      if (!tenant) {
        return res.status(400).json({ message: 'Invalid or inactive tenant' });
      }

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
