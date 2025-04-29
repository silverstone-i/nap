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
import { readdirSync, statSync } from 'fs';
import path from 'path';

const enabledModules = ['core', 'activities', 'tenants']; // TODO: Load dynamically per tenant or env config

async function loadModuleRoutes(moduleName) {
  const moduleRouter = express.Router();
  const moduleApiPath = path.resolve(`./modules/${moduleName}/apiRoutes`);

  const versions = readdirSync(moduleApiPath, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory() && dirent.name.startsWith('v'))
    .map(dirent => dirent.name);

  for (const version of versions) {
    const versionPath = path.join(moduleApiPath, version);

    const versionRouterModule = await import(`../modules/${moduleName}/apiRoutes/${version}/${moduleName}ApiRoutes.js`).catch(() => null);

    if (versionRouterModule && versionRouterModule.default) {
      moduleRouter.use(`/${version}`, versionRouterModule.default);
    }
  }

  return moduleRouter;
}

const apiRoutes = await Promise.all(
  enabledModules.map(async (moduleName) => await loadModuleRoutes(moduleName))
);

export default apiRoutes;
