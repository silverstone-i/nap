/**
 * @file Passport.js Local Strategy — validates email/password against admin.nap_users
 * @module auth/services/passportService
 *
 * nap_users is a pure identity table per PRD §3.2.2. Tenant info is
 * resolved via join to admin.tenants. Personal info will come from the
 * linked entity once entity tables exist.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcrypt';
import db from '../../../db/db.js';

passport.use(
  new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
    try {
      const user = await db('napUsers', 'admin').findOneBy([{ email }]);

      if (!user) return done(null, false, { message: 'Incorrect email.' });

      // Soft delete check
      if (user.deactivated_at !== null) {
        return done(null, false, { message: 'User account is inactive.' });
      }

      // Locked status check
      if (user.status === 'locked') {
        return done(null, false, { message: 'Account is locked. Contact your administrator.' });
      }

      const isMatch = await bcrypt.compare(password, user.password_hash);
      if (!isMatch) return done(null, false, { message: 'Incorrect password.' });

      // Verify tenant is active
      const tenant = await db('tenants', 'admin').findById(user.tenant_id);
      if (!tenant || tenant.deactivated_at !== null) {
        return done(null, false, { message: 'Tenant is inactive.' });
      }

      // Attach tenant context for the auth controller
      user._tenant = tenant;

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }),
);

export default passport;
