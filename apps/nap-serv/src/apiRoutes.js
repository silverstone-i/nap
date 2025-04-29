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

  try {
    for (const version of versions) {
      const versionRouterFile = `../modules/${moduleName}/apiRoutes/${version}/${moduleName}ApiRoutes.js`;

      const versionRouterModule = await import(versionRouterFile);

      if (versionRouterModule && versionRouterModule.default) {
        moduleRouter.use(`/${version}`, versionRouterModule.default);
      }
    }
  } catch (error) {
    console.error(`Error loading module ${moduleName}:`, error.message);
    return null;
  }

  return moduleRouter;
}

const apiRoutes = await Promise.all(
  enabledModules.map(async moduleName => {
    const routes = await loadModuleRoutes(moduleName);
    return routes;
  })
);

export default apiRoutes;
