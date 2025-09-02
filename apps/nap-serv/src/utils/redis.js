'use strict';

import { createClient } from 'redis';

let client;

export async function getRedis() {
  if (client && client.isOpen) return client;

  const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  let password = process.env.REDIS_PASSWORD;
  // Remove quotes if present
  if (password && password.startsWith('"') && password.endsWith('"')) {
    password = password.slice(1, -1);
  }

  client = createClient({
    url,
    password,
  });

  try {
    await client.connect();
    return client;
  } catch (err) {
    console.warn('⚠️ Redis not available, continuing without cache:', err.message);
    client = null; // ensure future calls know Redis is disabled
    return null;
  }
}

export default { getRedis };
