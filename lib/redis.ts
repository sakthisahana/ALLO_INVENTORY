import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis: Redis };

function createRedisClient(): Redis {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) throw new Error("REDIS_URL environment variable is not set");
  const client = new Redis(redisUrl, { maxRetriesPerRequest: 3 });
  client.on("error", (err) => console.error("Redis error:", err));
  return client;
}

export const redis = globalForRedis.redis || createRedisClient();
if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

export async function acquireLock(key: string): Promise<string | null> {
  const lockValue = `${Date.now()}-${Math.random()}`;
  for (let i = 0; i < 20; i++) {
    // ioredis v5: set(key, value, expiryMode, time, setMode)
    const result = await (redis as Redis).set(key, lockValue, "PX", 5000, "NX");
    if (result === "OK") return lockValue;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

export async function releaseLock(key: string, value: string): Promise<void> {
  const script = `if redis.call("GET",KEYS[1])==ARGV[1] then return redis.call("DEL",KEYS[1]) else return 0 end`;
  await redis.eval(script, 1, key, value);
}
