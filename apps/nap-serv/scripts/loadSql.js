'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

import fs from 'fs';
import path from 'path';
import db from '../src/db/db.js';

const sqlRoot = path.resolve('./sql');

async function loadSql({ schemas = [], version = 'v1' } = {}) {
  console.log('Loading SQL files for schemas:', schemas, 'version:', version);
  
  const folders = [`views/${version}`, `functions/${version}`];
  for (const folderPath of folders) {
    const folder = folderPath.split('/')[0];
    console.log(`Loading SQL files from ${folderPath}`);
    const dir = path.join(sqlRoot, folderPath);
    console.log('Directory:', dir);
    
    if (!fs.existsSync(dir)) continue;
    console.log('files found in directory:', dir);

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql'));
    console.log('Found SQL files:', files);
    

    for (const file of files) {
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      for (const schema of schemas) {
        const namespacedSql = sql.replace(/\btenantid\b/g, schema); // replace placeholder with actual schema
        try {
          await db.none(namespacedSql);
          console.log(`✅ Loaded ${folderPath}/${file} into schema '${schema}'`);
        } catch (err) {
          console.error(`❌ Error loading ${file} into schema '${schema}':`, err.message);
        }
      }
    }
  }
}

export default loadSql;