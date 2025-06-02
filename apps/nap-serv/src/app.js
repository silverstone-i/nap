'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */
import express from 'express';
import cors from 'cors';

import apiRoutes from './apiRoutes.js';

import cookieParser from 'cookie-parser';
import { authenticateJwt } from '../modules/tenants/middlewares/authenticateJwt.js';

const app = express();

// Middleware
app.use(cors(/* options */));
app.use(express.json());

app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());

// Morgan + Winston API logging setup
import morgan from 'morgan';
import { createLogger, format } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

// Setup API Logger
const accessLogDir = path.join(process.cwd(), 'logs/api-logs');
const apiLogger = createLogger({
  level: 'info',
  format: format.combine(format.timestamp(), format.json()),
  transports: [
    new DailyRotateFile({
      filename: path.join(accessLogDir, 'access-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d',
      zippedArchive: true,
    }),
  ],
});

// Morgan middleware to write structured logs
app.use(
  morgan(
    (tokens, req, res) => {
      const logData = {
        method: tokens.method(req, res),
        url: tokens.url(req, res),
        statusCode: parseInt(tokens.status(req, res), 10),
        responseTime: parseFloat(tokens['response-time'](req, res)),
        tenantId: req.tenantId || null,
        userId: req.user?.id || null,
      };
      return JSON.stringify(logData);
    },
    {
      stream: {
        write: message => {
          const log = JSON.parse(message);
          apiLogger.info(log);
        },
      },
    }
  )
);

app.use((req, res, next) => {
  const publicRoutes = [
    '/api/tenants/v1/auth/login',
    '/api/tenants/v1/auth/refresh',
    '/api/tenants/v1/auth/register',
  ];

  if (publicRoutes.includes(req.path)) {
    return next();
  }

  return authenticateJwt(req, res, next);
});

// Mount each module's router under /api
app.use('/api', apiRoutes);

// Test route
app.get('/', (req, res) => {
  res.send('API is running');
});

// 404 handler
app.use((req, res) => {
  res.status(404).send('Not Found');
});

export default app;
