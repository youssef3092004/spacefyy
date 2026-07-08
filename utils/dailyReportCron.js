import cron from "node-cron";
import process from "process";
import { prisma } from "../configs/db.js";
import { computeDailyBranchAggregate } from "./reportAggregation.js";

export const computeAndStoreBranchDailyReport = async (branchId, date) => {
  const dayStart = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const metrics = await computeDailyBranchAggregate([branchId], dayStart, dayEnd);

  return prisma.branchDailyReport.upsert({
    where: { branchId_date: { branchId, date: dayStart } },
    update: metrics,
    create: { branchId, date: dayStart, ...metrics },
  });
};

export const runDailyBranchReports = async () => {
  const now = new Date();
  // Always snapshot yesterday (UTC) — today isn't finished yet.
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const branches = await prisma.branch.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  if (!branches.length) {
    console.log("[DailyReportCron] No active branches found. Skipping.");
    return { total: 0, success: 0, failed: 0 };
  }

  let success = 0;
  let failed = 0;

  for (const branch of branches) {
    try {
      await computeAndStoreBranchDailyReport(branch.id, yesterday);
      success += 1;
    } catch (error) {
      failed += 1;
      console.error(`[DailyReportCron] Failed for branch ${branch.id}:`, error);
    }
  }

  console.log(
    `[DailyReportCron] Done. date=${yesterday.toISOString().slice(0, 10)}, total=${branches.length}, success=${success}, failed=${failed}`,
  );

  return { total: branches.length, success, failed };
};

export const startDailyReportCron = () => {
  const enabled = process.env.ENABLE_DAILY_REPORT_CRON !== "false";

  if (!enabled) {
    console.log("[DailyReportCron] Disabled by ENABLE_DAILY_REPORT_CRON=false");
    return null;
  }

  // Runs at 00:10 UTC every day, shortly after the day closes.
  const schedule = process.env.DAILY_REPORT_CRON || "10 0 * * *";
  const timezone = process.env.DAILY_REPORT_CRON_TZ || "UTC";

  if (!cron.validate(schedule)) {
    console.error(
      `[DailyReportCron] Invalid cron expression: ${schedule}. Job not started.`,
    );
    return null;
  }

  const job = cron.schedule(
    schedule,
    async () => {
      try {
        await runDailyBranchReports();
      } catch (error) {
        console.error("[DailyReportCron] Unexpected cron error:", error);
      }
    },
    { timezone },
  );

  console.log(
    `[DailyReportCron] Started. schedule='${schedule}', timezone='${timezone}'`,
  );

  if (process.env.RUN_DAILY_REPORT_ON_BOOT === "true") {
    runDailyBranchReports().catch((error) => {
      console.error("[DailyReportCron] Boot run failed:", error);
    });
  }

  return job;
};
