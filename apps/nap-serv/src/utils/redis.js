'use strict';

import { createClient } from 'redis';

let client;

export async function getRedis() {
  if (client) return client;
  const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  client = createClient({ url });
  client.on('error', (err) => console.error('Redis Client Error', err));
  if (!client.isOpen) await client.connect();
  return client;
}

export default { getRedis };
