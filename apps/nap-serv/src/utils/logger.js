'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { createLogger, format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const env = process.env.NODE_ENV || 'development';
const isDevelopment = env === 'development';
const logDir = path.join(process.cwd(), 'logs');

// Formatter based on environment
const devFormat = format.combine(
  format.colorize(),
  format.timestamp(),
  format.printf(({ level, message, timestamp }) => {
    return `[${timestamp}] ${level}: ${message}`;
  })
);

const prodFormat = format.combine(format.timestamp(), format.json());

// Main Logger
const logger = createLogger({
  level: isDevelopment ? 'debug' : 'info',
  format: isDevelopment ? devFormat : prodFormat,
  transports: [
    new transports.Console(),

    new DailyRotateFile({
      filename: path.join(logDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxFiles: '14d',
      zippedArchive: true,
    }),

    new DailyRotateFile({
      filename: path.join(logDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
      zippedArchive: true,
    }),
  ],
});

export default logger;
