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

let DATABASE_URL;
switch (process.env.NODE_ENV) {
  case 'development':
    DATABASE_URL = process.env.DATABASE_URL_DEV;
    break;
  case 'test':
    DATABASE_URL = process.env.DATABASE_URL_TEST;
    break;
  // TODO: Uncomment when ready for production  
  // case 'production':
  //   DATABASE_URL = process.env.DATABASE_URL_PROD;
  //   break;
  default:
    throw new Error('NODE_ENV is not set to a valid value');
}

console.log('DATABASE_URL:', DATABASE_URL);
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}


console.log('\nInitializing database connection...');
const { db, pgp } = DB.init(DATABASE_URL, repositories);
console.log('Database connection established.\n');

export { db, pgp };
