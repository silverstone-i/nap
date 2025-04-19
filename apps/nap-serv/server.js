'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/
import 'dotenv/config'
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