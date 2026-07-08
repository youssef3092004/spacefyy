import { redisClient } from "../configs/redis.js";
import process from "process";
import { indexCacheKeyByRequest } from "../utils/cacheInvalidation.js";

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
          const ttl = parseInt(process.env[ttlEnvKey]);

          if (ttl && ttl > 0) {
            redisClient.setEx(key, ttl, JSON.stringify(body)).catch((error) => {
              console.error("Cache write failed:", error);
            });
          } else {
            redisClient.set(key, JSON.stringify(body)).catch((error) => {
              console.error("Cache write failed:", error);
            });
          }

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
