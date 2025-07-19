'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

import loadSql from './loadSql.js';

const args = process.argv.slice(2);
const versionArg = args.find(arg => arg.startsWith('--version='));
const version = versionArg ? versionArg.split('=')[1] : 'v1';
const schemas = args.filter(arg => !arg.startsWith('--'));

if (schemas.length === 0) {
  console.error('❌ Please specify at least one schema.');
  process.exit(1);
}
console.log(`Loading SQL for schemas: ${schemas.join(', ')} with version: ${version}`); 

loadSql({ schemas, version })
  .then(() => {
    console.log('✅ SQL migration complete.');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Migration error:', err);
    process.exit(1);
  });