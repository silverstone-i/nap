'use strict';

import bcrypt from 'bcrypt';

export async function hashPassword(password) {
  const rounds = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
  return bcrypt.hash(password, rounds);
}

export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export default { hashPassword, comparePassword };
