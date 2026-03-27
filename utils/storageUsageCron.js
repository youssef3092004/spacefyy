import cron from "node-cron";
import process from "process";
import { prisma } from "../configs/db.js";
import { recordStorageSnapshot, updateStorageUsage } from "./storageUsage.js";

export const runWeeklyStorageUsageSnapshot = async () => {
  const businesses = await prisma.business.findMany({
    select: { id: true },
  });

  if (!businesses.length) {
    console.log("[StorageUsageCron] No businesses found. Skipping snapshot.");
    return { total: 0, success: 0, failed: 0 };
  }

  let success = 0;
  let failed = 0;

  for (const business of businesses) {
    try {
      await updateStorageUsage(business.id);
      await recordStorageSnapshot(business.id);
      success += 1;
    } catch (error) {
      failed += 1;
      console.error(
        `[StorageUsageCron] Snapshot failed for business ${business.id}:`,
        error,
      );
    }
  }

  console.log(
    `[StorageUsageCron] Weekly snapshot completed. total=${businesses.length}, success=${success}, failed=${failed}`,
  );

  return { total: businesses.length, success, failed };
};

export const startStorageUsageCron = () => {
  const enabled = process.env.ENABLE_STORAGE_USAGE_CRON !== "false";

  if (!enabled) {
    console.log(
      "[StorageUsageCron] Disabled by ENABLE_STORAGE_USAGE_CRON=false",
    );
    return null;
  }

  const schedule = process.env.STORAGE_USAGE_CRON || "0 0 * * 0";
  const timezone = process.env.STORAGE_USAGE_CRON_TZ || "UTC";

  if (!cron.validate(schedule)) {
    console.error(
      `[StorageUsageCron] Invalid cron expression: ${schedule}. Job not started.`,
    );
    return null;
  }

  const job = cron.schedule(
    schedule,
    async () => {
      try {
        await runWeeklyStorageUsageSnapshot();
      } catch (error) {
        console.error("[StorageUsageCron] Unexpected cron error:", error);
      }
    },
    { timezone },
  );

  console.log(
    `[StorageUsageCron] Started. schedule='${schedule}', timezone='${timezone}'`,
  );

  if (process.env.RUN_STORAGE_USAGE_SNAPSHOT_ON_BOOT === "true") {
    runWeeklyStorageUsageSnapshot().catch((error) => {
      console.error("[StorageUsageCron] Boot snapshot failed:", error);
    });
  }

  return job;
};
