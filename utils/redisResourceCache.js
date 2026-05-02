import { redisClient } from "../configs/redis.js";
import process from "process";

/**
 * Build Redis cache key with multiple searchable filters
 * Format: resource:branchId:filter1:value1|filter2:value2|...
 */
export const buildResourceCacheKey = (resource, branchId, filters = {}) => {
  const sanitizedFilters = Object.entries(filters)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${String(v).toLowerCase()}`)
    .sort()
    .join("|");

  return sanitizedFilters
    ? `${resource}:${branchId}:${sanitizedFilters}`
    : `${resource}:${branchId}`;
};

/**
 * Get cached resource data
 */
export const getCachedResource = async (cacheKey) => {
  try {
    const cached = await redisClient.get(cacheKey);
    return cached ? JSON.parse(cached) : null;
  } catch (error) {
    console.error("Cache retrieval error:", error);
    return null;
  }
};

/**
 * Cache resource data with TTL
 */
export const setCachedResource = async (cacheKey, data, resourceType) => {
  try {
    const ttlEnvKey = `CACHE_${resourceType.toUpperCase()}_TTL`;
    const ttl = parseInt(process.env[ttlEnvKey]) || 3600; // Default 1 hour

    if (ttl > 0) {
      await redisClient.setEx(cacheKey, ttl, JSON.stringify(data));
    } else {
      await redisClient.set(cacheKey, JSON.stringify(data));
    }
  } catch (error) {
    console.error("Cache set error:", error);
  }
};

/**
 * Invalidate cache for a resource with wildcard patterns
 */
export const invalidateResourceCache = async (resource, branchId) => {
  try {
    const patterns = [
      `${resource}:${branchId}:*`, // All variations for this branch
      `${resource}:${branchId}`, // Exact match
    ];

    for (const pattern of patterns) {
      const stream = redisClient.scanIterator({
        MATCH: pattern,
        COUNT: 100,
      });

      for await (const keys of stream) {
        if (Array.isArray(keys) && keys.length > 0) {
          await redisClient.del(keys);
        }
      }
    }
  } catch (error) {
    console.error("Cache invalidation error:", error);
  }
};

/**
 * Build search filters from request query
 */
export const buildSearchFilters = (query, allowedFilters = []) => {
  const filters = {};

  allowedFilters.forEach((filter) => {
    if (
      query[filter] !== undefined &&
      query[filter] !== null &&
      query[filter] !== ""
    ) {
      filters[filter] = query[filter];
    }
  });

  return filters;
};

/**
 * Device-specific cache helpers
 */
export const deviceCacheHelpers = {
  buildKey: (branchId, filters = {}) =>
    buildResourceCacheKey("device", branchId, filters),

  getCached: async (cacheKey) => getCachedResource(cacheKey),

  setCached: async (cacheKey, data) =>
    setCachedResource(cacheKey, data, "device"),

  invalidate: async (branchId) => invalidateResourceCache("device", branchId),

  buildSearchFilters: (query) => {
    const allowedFilters = [
      "type",
      "isActive",
      "isBusy",
      "isSGL",
      "spaceId",
      "priceType",
    ];
    return buildSearchFilters(query, allowedFilters);
  },
};

/**
 * Space-specific cache helpers
 */
export const spaceCacheHelpers = {
  buildKey: (branchId, filters = {}) =>
    buildResourceCacheKey("space", branchId, filters),

  getCached: async (cacheKey) => getCachedResource(cacheKey),

  setCached: async (cacheKey, data) =>
    setCachedResource(cacheKey, data, "space"),

  invalidate: async (branchId) => invalidateResourceCache("space", branchId),

  buildSearchFilters: (query) => {
    const allowedFilters = [
      "type",
      "isActive",
      "isBusy",
      "capacity_min",
      "capacity_max",
      "priceType",
    ];
    return buildSearchFilters(query, allowedFilters);
  },
};

/**
 * Tool-specific cache helpers
 */
export const toolCacheHelpers = {
  buildKey: (branchId, filters = {}) =>
    buildResourceCacheKey("tool", branchId, filters),

  getCached: async (cacheKey) => getCachedResource(cacheKey),

  setCached: async (cacheKey, data) =>
    setCachedResource(cacheKey, data, "tool"),

  invalidate: async (branchId) => invalidateResourceCache("tool", branchId),

  buildSearchFilters: (query) => {
    const allowedFilters = [
      "type",
      "isActive",
      "isBusy",
      "spaceId",
      "deviceId",
      "priceType",
    ];
    return buildSearchFilters(query, allowedFilters);
  },
};
