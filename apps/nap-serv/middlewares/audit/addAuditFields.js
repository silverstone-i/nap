'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

export function addAuditFields(req, res, next) {
  const userName = req.user?.user_name; // assuming decoded JWT sets `req.user`

  if (!userName) return res.status(400).json({ message: 'Missing user context for audit fields.' });

  if (req.method === 'POST') {
    req.body.created_by = userName;
  }

  if (req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE') {
    req.body.updated_at = new Date().toISOString();
    req.body.updated_by = userName;
  }

  next();
}
