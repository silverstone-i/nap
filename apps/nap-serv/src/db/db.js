/**
 * @file DB.init() singleton setup — initializes pg-schemata with all model repositories
 * @module nap-serv/db/db
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { config as dotenvConfig } from 'dotenv';
import { DB } from 'pg-schemata';
import { getDatabaseUrl } from '../lib/envValidator.js';

// Walk up from cwd to find .env (handles monorepo workspace execution)
let dir = process.cwd();
while (dir !== dirname(dir)) {
  const envPath = resolve(dir, '.env');
  if (existsSync(envPath)) {
    dotenvConfig({ path: envPath });
    break;
  }
  dir = dirname(dir);
}

import repositories from './repositories.js';
import logger from '../lib/logger.js';

const DATABASE_URL = getDatabaseUrl();

if (!DB.db) {
  logger.info('Initializing database connection...');
  DB.init(DATABASE_URL, repositories, logger);
  logger.info('Database connection established.');
}

const rawDb = DB.db;
const pgp = DB.pgp;

/**
 * Creates a schema-aware callDb proxy that supports both model access and raw queries.
 * @param {object} rawDb pg-promise database instance with attached models
 * @returns {Function & object} callDb function with model properties and raw query passthroughs
 */
function createCallDb(rawDb) {
  const callDb = function (modelOrName, schemaName) {
    const model = typeof modelOrName === 'string' ? rawDb[modelOrName] : modelOrName;

    if (!model || typeof model.setSchemaName !== 'function') {
      throw new Error('callDb: provided model is not schema-aware');
    }

    return model.setSchemaName(schemaName);
  };

  for (const key of Object.keys(rawDb)) {
    if (typeof rawDb[key]?.setSchemaName === 'function') {
      callDb[key] = rawDb[key];
    }
  }

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
db.$pool = rawDb.$pool;

export { db as default, db, createCallDb, pgp, DB };
