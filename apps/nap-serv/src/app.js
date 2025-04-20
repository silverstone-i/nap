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

const app = express();

// Middleware
app.use(cors(/* options */));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

import db from './db/db.js';

// Test route
app.get('/', (req, res) => {
  res.send('API is running');
});

// 404 handler
app.use((req, res) => {
  res.status(404).send('Not Found');
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

export default app;