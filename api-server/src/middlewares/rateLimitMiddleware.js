const rateLimitMap = new Map();

function rateLimit(key, limit = 5, windowMs = 60_000) {
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
