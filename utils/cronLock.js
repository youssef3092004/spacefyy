import { randomUUID } from "crypto";
import { redisClient } from "../configs/redis.js";

/**
 * Cross-instance job lock.
 *
 * Every app instance starts its own copy of every cron, so a two-instance
 * deploy ran each job twice — duplicating StorageUsageHistory rows and
 * doubling the query load. This also guards a slow run against overlapping
 * its own next tick.
 *
 * Redis rather than a Postgres advisory lock: advisory locks are bound to the
 * database SESSION, and Prisma hands out pooled connections, so the release
 * would usually run on a different connection than the acquire — leaving the
 * lock held until that connection was recycled and wedging the job.
 *
 * The TTL is the safety net for a process that dies mid-run: the lock expires
 * on its own rather than blocking the job forever. It is refreshed while the
 * task runs so a long job never loses a lock it is still holding.
 */

const LOCK_TTL_MS = 5 * 60 * 1000;
const REFRESH_INTERVAL_MS = Math.floor(LOCK_TTL_MS / 3);

const lockKeyFor = (jobName) => `cronLock:${jobName}`;

// Only release a lock we still own — never one that expired and was picked up
// by another instance in the meantime.
const releaseIfOwned = async (key, token) => {
  const current = await redisClient.get(key);
  if (current === token) await redisClient.del(key);
};

/**
 * Runs `task` only if no other instance holds the lock for `jobName`.
 *
 * Returns whatever `task` returns, so callers (including the manual-trigger
 * endpoints) see an unchanged shape. A skipped run returns `{ skipped: true }`.
 *
 * If Redis is unavailable the task runs unlocked: a duplicated snapshot is a
 * better failure than silently never running the job at all.
 *
 * @param {string} jobName
 * @param {() => Promise<any>} task
 */
export const withCronLock = async (jobName, task) => {
  if (!redisClient.isReady) {
    console.warn(`[${jobName}] Redis unavailable — running without a lock.`);
    return task();
  }

  const key = lockKeyFor(jobName);
  const token = randomUUID();

  let acquired = false;
  try {
    acquired =
      (await redisClient.set(key, token, { NX: true, PX: LOCK_TTL_MS })) === "OK";
  } catch (error) {
    console.error(`[${jobName}] Lock acquire failed, running unlocked:`, error);
    return task();
  }

  if (!acquired) {
    console.log(`[${jobName}] Another instance holds the lock. Skipping run.`);
    return { skipped: true };
  }

  // Keep the lock alive for as long as the task is actually running.
  const refresh = setInterval(() => {
    redisClient
      .set(key, token, { XX: true, PX: LOCK_TTL_MS })
      .catch((error) => console.error(`[${jobName}] Lock refresh failed:`, error));
  }, REFRESH_INTERVAL_MS);
  refresh.unref?.();

  try {
    return await task();
  } finally {
    clearInterval(refresh);
    await releaseIfOwned(key, token).catch((error) => {
      console.error(`[${jobName}] Failed to release lock:`, error);
    });
  }
};
