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

const app = express();

// Middleware
app.use(cors(/* options */));
app.use(express.json());

app.use(express.urlencoded({ extended: true }));

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

// Development-only: mock tenantId and userId for logging
app.use((req, res, next) => {
  req.tenantId = req.headers['x-tenant-id'] || 'default-tenant';
  req.user = req.user || { id: req.headers['x-user-id'] || 'anonymous-user' };
  next();
});

// Mount each module's router under /api
apiRoutes.forEach(router => {
  if (router) {
    app.use('/api', router);
  }
});

// Test route
app.get('/', (req, res) => {
  res.send('API is running');
});

// 404 handler
app.use((req, res) => {
  res.status(404).send('Not Found');
});

export default app;
