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
import { readdirSync } from 'fs';
import path from 'path';

const router = express.Router();

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const versionDir = path.join(__dirname, 'v1');

const files = readdirSync(versionDir)
  .filter(file => file.endsWith('Api.js'));

for (const file of files) {
  const routeModule = await import(`./v1/${file}`);
  const route = routeModule.default;

  let mountPath = file
    .replace('Api.js', '')
    .replace(/[A-Z]/g, letter => '-' + letter.toLowerCase())
    .replace(/^-/, '');

  if (mountPath === 'cost-line') mountPath = 'cl';

  router.use(`/${mountPath}`, route);
}

export default router;
