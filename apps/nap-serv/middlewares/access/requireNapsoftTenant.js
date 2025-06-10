'use strict';

/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

export function requireNapsoftTenant(req, res, next) {  
  if (req.user.tenant_code.toLowerCase() !== process.env.NAPSOFT_TENANT.toLowerCase()) {
    return res.status(403).json({ message: 'Access denied: not a NapSoft user.' });
  }
  next();
}