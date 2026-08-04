import { redisClient } from "../configs/redis.js";
import process from "process";
import { indexCacheKeyByRequest } from "../utils/cacheInvalidation.js";

// Fallback expiry when the configured TTL env var is missing or unparseable.
const DEFAULT_TTL = 300;

export const cacheMiddleware = (keyBuilder, type) => {
  return async (req, res, next) => {
    try {
      if (req.method !== "GET") {
        return next();
      }

      let key;
      try {
        key = keyBuilder(req);
      } catch (error) {
        console.error("Cache key build failed:", error);
        return next();
      }

      if (!redisClient.isReady) {
        return next();
      }

      let cachedData = null;
      try {
        cachedData = await redisClient.get(key);
      } catch (error) {
        console.error("Cache read failed:", error);
        return next();
      }

      if (cachedData) {
        return res.status(200).json({
          ...JSON.parse(cachedData),
          source: "cache",
        });
      }

      const originalJson = res.json.bind(res);

      res.json = (body) => {
        // Only cache successful responses
        if (body.status === "success" || body.success === true) {
          const ttlEnvKey = `${type}`;
          const parsedTtl = parseInt(process.env[ttlEnvKey]);
          // Never write without an expiry: a missing or malformed TTL env var
          // used to fall through to a plain SET, making that response cached
          // permanently and impossible to age out.
          const ttl = parsedTtl && parsedTtl > 0 ? parsedTtl : DEFAULT_TTL;

          redisClient.setEx(key, ttl, JSON.stringify(body)).catch((error) => {
            console.error("Cache write failed:", error);
          });

          indexCacheKeyByRequest(req, key).catch((error) => {
            console.error("Cache key indexing failed:", error);
          });
        }

        return originalJson(body);
      };

      next();
    } catch (err) {
      console.error("Cache middleware failed open:", err);
      next();
    }
  };
};
