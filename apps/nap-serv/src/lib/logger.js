/**
 * @file Winston logger with structured JSON output
 * @module nap-serv/lib/logger
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { createLogger, format, transports } from 'winston';

const env = process.env.NODE_ENV || 'development';
const isDevelopment = env === 'development';

const devFormat = format.combine(
  format.colorize(),
  format.timestamp(),
  format.printf(({ level, message, timestamp, ...meta }) => {
    const metaString = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `[${timestamp}] ${level}: ${message} ${metaString}`;
  }),
);

const prodFormat = format.combine(format.timestamp(), format.json());

const logger = createLogger({
  level: isDevelopment ? 'debug' : 'info',
  format: isDevelopment ? devFormat : prodFormat,
  transports: [new transports.Console()],
  silent: env === 'test',
});

export default logger;
