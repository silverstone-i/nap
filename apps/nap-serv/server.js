/**
 * @file Server entry point — starts Express on configured port
 * @module nap-serv/server
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import 'dotenv/config';
import app from './src/app.js';

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

app.listen(PORT, (err) => {
  if (err) {
    console.error('Error starting server:', err);
    return;
  }

  console.log(`Server running in ${process.env.NODE_ENV} mode at http://${HOST}:${PORT}`);
});
