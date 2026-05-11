import "dotenv/config";
import { createClient } from "redis";
import process from "process";

async function clearHistoryCache() {
  const redisClient = createClient({
    username: process.env.USERNAME_REDIS,
    password: process.env.PASSWORD_REDIS,
    socket: {
      host: process.env.HOST_REDIS,
      port: parseInt(process.env.PORT_REDIS),
    },
  });

  redisClient.on("error", (err) => console.log("Redis Client Error", err));

  try {
    await redisClient.connect();
    console.log("✅ Connected to Redis");

    const keys = await redisClient.keys("space-history:*");
    console.log("Found cache keys:", keys.length);

    if (keys.length > 0) {
      const deleted = await redisClient.del(keys);
      console.log(`✅ Deleted ${deleted} cache keys for space history`);
    } else {
      console.log("No cache keys found for space history");
    }

    await redisClient.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Error clearing cache:", error);
    process.exit(1);
  }
}

clearHistoryCache();
