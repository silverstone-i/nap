/**
 * @file Redis client singleton — lazy-initialized ioredis connection
 * @module nap-serv/utils/redis
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import Redis from 'ioredis';

let client = null;

/**
 * Returns a shared Redis client, creating one on first call.
 * @returns {Promise<Redis>} ioredis client instance
 */
export async function getRedis() {
  if (client) return client;

  const url = process.env.REDIS_URL || 'redis://localhost:6379';
  client = new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  await client.connect();
  return client;
}

/**
 * Disconnect and reset the Redis client. Useful for test teardown.
 */
export async function closeRedis() {
  if (client) {
    await client.quit();
    client = null;
  }
}

export default { getRedis, closeRedis };
