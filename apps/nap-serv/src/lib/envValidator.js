/**
 * @file Validates required environment variables at startup
 * @module nap-serv/lib/envValidator
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/**
 * Validates that all required environment variables are set.
 * Throws an error listing all missing variables if any are absent.
 * @param {string[]} required List of required env var names
 * @param {object} [env=process.env] Environment object to validate against
 * @returns {{ valid: true, missing: [] }} Validation result
 * @throws {Error} If any required variables are missing
 */
export function validateEnv(required = [], env = process.env) {
  const missing = required.filter((key) => !env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return { valid: true, missing: [] };
}

/** Required env vars for the server to start */
export const REQUIRED_ENV_VARS = ['NODE_ENV'];

/** Required env vars for database connection */
export const REQUIRED_DB_ENV_VARS = ['NODE_ENV'];

/**
 * Returns the database URL for the current environment.
 * @param {object} [env=process.env] Environment object
 * @returns {string} Database URL
 * @throws {Error} If NODE_ENV is invalid or database URL is not set
 */
export function getDatabaseUrl(env = process.env) {
  switch (env.NODE_ENV) {
    case 'development':
      if (!env.DATABASE_URL_DEV) throw new Error('DATABASE_URL_DEV is not set');
      return env.DATABASE_URL_DEV;
    case 'test':
      if (!env.DATABASE_URL_TEST) throw new Error('DATABASE_URL_TEST is not set');
      return env.DATABASE_URL_TEST;
    case 'production':
      if (!env.DATABASE_URL_PROD) throw new Error('DATABASE_URL_PROD is not set');
      return env.DATABASE_URL_PROD;
    default:
      throw new Error(`NODE_ENV is not set to a valid value: "${env.NODE_ENV}"`);
  }
}
