const Redis = process.env.REDIS_URL ? require('ioredis') : null;

let redis = null;
if (Redis) {
  redis = new Redis(process.env.REDIS_URL, { enableOfflineQueue: false, lazyConnect: false });
  redis.on('error', err => {
    // Log but don't crash — fall back to in-memory
    if (err.code !== 'ECONNRESET') console.error('[rate-limit] Redis error:', err.message);
    redis = null;
  });
}

// In-memory fallback (single instance only — use Redis in production)
const rateLimitMap = new Map();
setInterval(() => {
  const cutoff = Date.now() - 5 * 60_000;
  for (const [key, record] of rateLimitMap) {
    if (record.time < cutoff) rateLimitMap.delete(key);
  }
}, 5 * 60_000).unref();

async function rateLimit(key, limit = 5, windowMs = 60_000) {
  if (redis) {
    try {
      const redisKey = `rl:${key}`;
      const count = await redis.incr(redisKey);
      if (count === 1) {
        await redis.pexpire(redisKey, windowMs);
      }
      return count <= limit;
    } catch {
      // Redis failed mid-request — fall through to in-memory
    }
  }

  const now = Date.now();
  const record = rateLimitMap.get(key) || { count: 0, time: now };

  if (now - record.time > windowMs) {
    record.count = 0;
    record.time = now;
  }

  record.count++;
  rateLimitMap.set(key, record);
  return record.count <= limit;
}

module.exports = { rateLimit };