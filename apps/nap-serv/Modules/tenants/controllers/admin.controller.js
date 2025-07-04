'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

import db from '../../../src/db/db.js';

export async function getAllSchemas(req, res) {
  try {
    const tenants = await db('tenants', 'admin').findAll();    
    const schemas = Array.from(new Set(['admin', ...tenants.map(t => t.tenant_code.toLowerCase())]));

    res.json(schemas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export function switchSchema(req, res) {
  if (req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  req.schema = req.params.schema.toLowerCase();
  res.json({ message: `Schema switched to ${req.schema}` });
}
