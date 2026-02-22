/**
 * @file Central error handler — maps error types to HTTP status codes
 * @module nap-serv/middleware/errorHandler
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import logger from '../lib/logger.js';

/**
 * Maps pg-schemata and application error types to HTTP responses.
 * @param {Error} err
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
export function errorHandler(err, _req, res, _next) {
  // pg-schemata SchemaDefinitionError (validation failures)
  if (err.name === 'SchemaDefinitionError' || err.type === 'validation') {
    return res.status(400).json({
      error: 'Validation failed',
      details: err.details || err.message,
    });
  }

  // pg-schemata DatabaseError — unique constraint violation
  if (err.name === 'DatabaseError' && err.code === '23505') {
    return res.status(409).json({
      error: 'Duplicate record',
      constraint: err.constraint || err.message,
    });
  }

  // pg-schemata DatabaseError — foreign key violation
  if (err.name === 'DatabaseError' && err.code === '23503') {
    return res.status(422).json({
      error: 'Referenced record not found',
      constraint: err.constraint || err.message,
    });
  }

  // Application-level errors with explicit status codes
  if (err.status) {
    return res.status(err.status).json({
      error: err.message || 'Request error',
    });
  }

  // Unhandled errors
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });

  const isProd = process.env.NODE_ENV === 'production';
  res.status(500).json({
    error: 'Internal server error',
    ...(isProd ? {} : { message: err.message }),
  });
}
