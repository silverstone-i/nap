'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { db } from '../../../src/db/db.js';
import bcrypt from 'bcrypt';

passport.use(
  new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
    try {
      const user = await db('napUsers', 'admin').findOneBy([{ email }]);
      
      if (!user) return done(null, false, { message: 'Incorrect email.' });
      
      user.is_active = user.deactivated_at === null; // Soft delete check      

      if (!user.is_active) return done(null, false, { message: 'User account is inactive.' });

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) return done(null, false, { message: 'Incorrect password.' });

      const tenant = await db('tenants', 'admin').findOneBy([{ tenant_code: user.tenant_code }]);
      if (!tenant || tenant.deactivated_at !== null) {
        return done(null, false, { message: 'Tenant is inactive.' });
      }

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  })
);

export default passport;
