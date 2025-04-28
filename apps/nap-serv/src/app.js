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

// Load API routes based on enabled modules
apiRoutes.forEach(({ prefix, routes }) => {
  routes.forEach((router) => {
    app.use(`/api/${prefix}`, router);    
  });
});

// Test route
app.get('/', (req, res) => {
  res.send('API is running');
});

// 404 handler
app.use((req, res) => {
  res.status(404).send('Not Found');
});

// Global error handler
function globalErrorHandler(err, req, res, next) {
  console.error(err.stack);
  res.status(500).send('Something broke!');
}

app.use(globalErrorHandler);

export { app as default, globalErrorHandler };