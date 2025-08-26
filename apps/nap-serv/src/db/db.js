'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */
import 'dotenv/config';

import { DB } from 'pg-schemata';
import repositories from './repositories.js';
import logger from '../utils/logger.js';

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

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set');
}

if (!DB.db) {
  console.log('\nInitializing database connection...');
  DB.init(DATABASE_URL, repositories, logger);
  console.log('Database connection established.\n');
}

const rawDb = DB.db;
const pgp = DB.pgp;

// console.log('🔧 Loaded model keys:', Object.keys(rawDb));
console.log('Database connection established.\n');

// Defer callDb + db initialization until models are attached
function createCallDb(rawDb) {
  const callDb = function (modelOrName, schemaName) {
    const model = typeof modelOrName === 'string' ? rawDb[modelOrName] : modelOrName;

    if (!model || typeof model.setSchemaName !== 'function') {
      throw new Error('callDb: provided model is not schema-aware');
    }

    return model.setSchemaName(schemaName);
    // if (schemaModel.logger === undefined && logger !== undefined) {
    //   schemaModel.logger = logger;
    // }
    // return schemaModel;
  };

  for (const key of Object.keys(rawDb)) {
    if (typeof rawDb[key]?.setSchemaName === 'function') {
      callDb[key] = rawDb[key];
    }
  }

  // Attach pg-promise instance methods like none, one, etc.
  const passthroughs = [
    'connect',
    'query',
    'none',
    'one',
    'many',
    'oneOrNone',
    'manyOrNone',
    'any',
    'result',
    'multiResult',
    'multi',
    'stream',
    'func',
    'proc',
    'map',
    'each',
    'task',
    'taskIf',
    'tx',
    'txIf',
  ];

  for (const fn of passthroughs) {
    if (typeof rawDb[fn] === 'function') {
      callDb[fn] = rawDb[fn].bind(rawDb);
    }
  }

  return callDb;
}

const db = createCallDb(rawDb);

// Attach pg-promise `$pool` to db for lifecycle management
db.$pool = rawDb.$pool;

export { db as default, db, createCallDb, pgp, DB };

// // Singleton guard for callDb instance
// let callDbInstance;
// function getDb() {
//   if (!callDbInstance) {
//     callDbInstance = createCallDb(rawDb);
//     callDbInstance.$pool = rawDb.$pool;
//   }
//   return callDbInstance;
// }

// // Export default instance and getter for compatibility
// export default getDb();
// export const db = getDb;
// export { createCallDb, pgp, DB };
