import { redisClient } from "../configs/redis.js";

const sanitizeTag = (value) => String(value).trim().toLowerCase();

const routeEntityFromBaseUrl = (baseUrl = "") => {
  const parts = baseUrl.split("/").filter(Boolean);
  return parts.length ? sanitizeTag(parts[parts.length - 1]) : "unknown";
};

const singularize = (value) => {
  if (!value || value.length < 2) return value;
  if (value.endsWith("ies")) return `${value.slice(0, -3)}y`;
  if (value.endsWith("ses")) return value.slice(0, -2);
  if (value.endsWith("s")) return value.slice(0, -1);
  return value;
};

export const buildCacheTagsFromRequest = (req) => {
  const entity = routeEntityFromBaseUrl(req.baseUrl);
  const singular = singularize(entity);

  const tags = new Set([
    `route:${entity}`,
    `prefix:${entity}`,
    `prefix:${singular}`,
  ]);

  const params = req.params || {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    tags.add(`param:${sanitizeTag(key)}:${sanitizeTag(value)}`);
    tags.add(`prefix:${sanitizeTag(key)}`);
  }

  return Array.from(tags);
};

export const indexCacheKeyByRequest = async (req, cacheKey) => {
  if (!cacheKey) return;

  const tags = buildCacheTagsFromRequest(req);

  await Promise.all(
    tags.map((tag) => redisClient.sAdd(`cacheTag:${tag}`, cacheKey)),
  );
};

export const invalidateCacheByRequest = async (req) => {
  const tags = buildCacheTagsFromRequest(req);

  const keysToDelete = new Set();

  for (const tag of tags) {
    const setName = `cacheTag:${tag}`;
    const members = await redisClient.sMembers(setName);

    for (const key of members) {
      keysToDelete.add(key);
    }

    if (members.length > 0) {
      await redisClient.del(setName);
    }
  }

  const params = req.params || {};

  const entity = routeEntityFromBaseUrl(req.baseUrl);
  keysToDelete.add(`${entity}:*`);
  keysToDelete.add(`${singularize(entity)}:*`);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    keysToDelete.add(`*${key}=${value}*`);
    keysToDelete.add(`*${value}*`);
  }

  for (const pattern of keysToDelete) {
    if (pattern.includes("*")) {
      await invalidateCacheByPattern(pattern);
    } else {
      await redisClient.del(pattern);
    }
  }
};

export const invalidateCacheByPattern = async (pattern) => {
  const stream = redisClient.scanIterator({
    MATCH: pattern,
    COUNT: 100,
  });

  for await (const keys of stream) {
    if (Array.isArray(keys)) {
      if (keys.length > 0) {
        await redisClient.del(keys);
      }
      continue;
    }

    if (keys) {
      await redisClient.del(keys);
    }
  }
};
