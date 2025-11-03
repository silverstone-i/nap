'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import 'dotenv/config.js';
import bcrypt from 'bcrypt';
import { fileURLToPath } from 'node:url';
import { db, pgp } from '../src/db/db.js';

async function checkRootPassword() {
  const rootEmail = process.env.ROOT_EMAIL;
  const rootPassword = process.env.ROOT_PASSWORD;

  if (!rootEmail || !rootPassword) {
    console.error('❌ ROOT_EMAIL and ROOT_PASSWORD must be set in the environment.');
    process.exit(1);
  }

  try {
    const record = await db.napUsers.findWhere([{ email: rootEmail }]);
    if (record.length === 0) {
      console.error(`❌ No admin user found for email ${rootEmail}`);
      process.exitCode = 1;
      return;
    }

    const user = record[0];
    const matches = await bcrypt.compare(rootPassword, user.password_hash);
    const freshHash = await bcrypt.hash(rootPassword, 10);

    console.log(`🔐 ROOT_EMAIL: ${rootEmail}`);
    console.log(`🧂 Fresh hash for current ROOT_PASSWORD: ${freshHash}`);
    console.log(
      matches
        ? '✅ The stored password hash matches ROOT_PASSWORD.'
        : '⚠️ Stored password hash does NOT match ROOT_PASSWORD.',
    );
  } catch (error) {
    console.error('❌ Failed to verify root password:', error?.message || error);
    process.exitCode = 1;
  } finally {
    try {
      await pgp.end();
    } catch {
      // ignore
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  checkRootPassword();
}

export default checkRootPassword;
