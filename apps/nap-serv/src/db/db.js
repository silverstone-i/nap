'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */
import 'dotenv/config'

import { DB } from 'pg-schemata';
import repositories from './repositories.js';

console.log('Initializing database connection...');
const { db, pgp } = DB.init(process.env.DATABASE_URL, repositories);
console.log('Database connection established.');

export { db, pgp };
