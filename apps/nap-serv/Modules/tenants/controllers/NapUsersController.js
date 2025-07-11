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

  async archive(req, res) {
    if (req.query.email === req.user.email) {
      return res.status(403).json({ message: 'Cannot archive the currently logged-in user' });
    }

    return super.archive(req, res);
  }

  async restore(req, res) {
    try {
      const napUser = await this.model.findOneBy([{ email: req.query.email }], { includeDeactivated: true });
      if (!napUser) {
        return res.status(404).json({ message: 'User not found for restore.' });
      }
      const tenant = await db('tenants', 'admin').findOneBy([{ tenant_code: napUser.tenant_code }]);
      if (!tenant) {
        return res.status(403).json({ message: 'Tenant is deactivated.' });
      }
    } catch (err) {
      console.error('Error finding napUser for restore:', err);
      return res.status(500).json({ message: 'Error finding napUser for restore.' });
    }

    return super.restore(req, res);
  }

  register = async (req, res) => {
    const { tenant_code, schema_name, email, password, user_name, role } = req.body;

    if (!tenant_code || !email || !password || !user_name || !role) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    try {
      const tenant = await db('tenants', 'admin').findOneBy([
        {
          tenant_code,
          deactivated_at: { $is: null },
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
      if (err.name === 'SchemaDefinitionError') {
        return res.status(400).json({ InvalidInputData: err.cause });
      }
      res.status(500).json({ message: 'Error registering user' });
    }
  };
}

const instance = new NapUsersController();

export default instance; // Use in production and development environments
export { NapUsersController }; // Use in test environment
