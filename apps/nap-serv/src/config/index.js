/**
 * @file Environment configuration — loads and validates all required env vars at startup
 * @module nap-serv/config
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import 'dotenv/config';

const env = process.env.NODE_ENV || 'development';

const DATABASE_URLS = {
  development: process.env.DATABASE_URL_DEV,
  test: process.env.DATABASE_URL_TEST,
  production: process.env.DATABASE_URL_PROD,
};

const DATABASE_URL = DATABASE_URLS[env];

if (!DATABASE_URL) {
  throw new Error(`DATABASE_URL is not set for NODE_ENV="${env}". Check your .env file.`);
}

const config = {
  env,
  databaseUrl: DATABASE_URL,
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  accessTokenSecret: process.env.ACCESS_TOKEN_SECRET,
  refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET,
  rootEmail: process.env.ROOT_EMAIL,
  rootPassword: process.env.ROOT_PASSWORD,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  corsOrigins: process.env.CORS_ORIGINS || '',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  cookieSameSite: process.env.COOKIE_SAMESITE || 'Lax',
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
  napsoftTenant: process.env.NAPSOFT_TENANT || 'NAP',
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || 'localhost',
};

export default config;
