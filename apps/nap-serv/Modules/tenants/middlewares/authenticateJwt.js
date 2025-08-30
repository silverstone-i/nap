'use strict';

import jwt from 'jsonwebtoken';

export function authenticateJwt(req, res, next) {
  const authHeader = req.headers?.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err || !decoded) return res.status(401).json({ message: 'Unauthorized' });
    req.user = decoded;
    next();
  });
}

export default { authenticateJwt };
