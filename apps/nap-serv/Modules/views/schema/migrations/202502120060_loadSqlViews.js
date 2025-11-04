'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { defineMigration } from '../../../../src/db/migrations/defineMigration.js';
import { loadViews as loadModuleViews } from '../../../../scripts/loadViews.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_ROOT = path.resolve(__dirname, '../../../../sql');

function getViewFiles(version = 'v1') {
  const viewsDir = path.join(SQL_ROOT, 'views', version);
  if (!fs.existsSync(viewsDir)) return [];
  return fs
    .readdirSync(viewsDir)
    .filter(file => file.endsWith('.sql'))
    .map(file => ({
      name: file,
      path: path.join(viewsDir, file),
    }));
}

async function loadGlobalViews(db, schemaName, version = 'v1') {
  if (!schemaName || schemaName === 'admin') return;

  const files = getViewFiles(version);
  if (!files.length) {
    console.warn(`⚠️ No SQL views found under sql/views/${version}; skipping global view load.`);
    return;
  }

  for (const { name, path: filePath } of files) {
    const rawSql = fs.readFileSync(filePath, 'utf8');
    const namespacedSql = rawSql.replace(/\btenantid\b/gi, schemaName);
    const statement = `SET search_path TO ${schemaName};\n${namespacedSql}`;
    console.log(`⏳ Loading global view: sql/views/${version}/${name}`);
    try {
      await db.none(statement);
      console.log(`✅ Loaded global view: ${name}`);
    } catch (error) {
      console.error(`❌ Failed to load global view ${name}:`, error.message);
      throw error;
    }
  }
}

export default defineMigration({
  id: '202502120060-load-sql-views',
  description: 'Load SQL-based views for tenant schemas',
  async up({ schema, db }) {
    if (schema === 'admin') return;

    await loadModuleViews(db, schema);
    const version = process.env.SQL_VIEWS_VERSION || 'v1';
    await loadGlobalViews(db, schema, version);
  },
  // Views are created with CREATE OR REPLACE semantics; rollback is a no-op.
  async down() {},
});
