'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import logger from './src/utils/logger.js';
import 'dotenv/config';
import app from './src/app.js';

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

// Healthcheck route
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Global error handler
app.use((err, req, res) => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, err => {
  if (err) {
    logger.error('Error starting server:', err);
    return;
  }

  logger.info(`Server running in ${process.env.NODE_ENV} mode at http://${HOST}:${PORT}`);
});
