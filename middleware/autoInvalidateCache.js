import { invalidateCacheByRequest } from "../utils/cacheInvalidation.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const autoInvalidateCache = () => {
  return (req, res, next) => {
    if (!MUTATING_METHODS.has(req.method)) {
      return next();
    }

    res.on("finish", () => {
      const isSuccess = res.statusCode >= 200 && res.statusCode < 400;

      if (!isSuccess) return;

      invalidateCacheByRequest(req).catch((error) => {
        console.error("Auto cache invalidation failed:", error);
      });
    });

    next();
  };
};
